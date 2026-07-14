from datetime import datetime, timezone
from pathlib import Path
import secrets

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles
from app.core.config import settings
from app.db.session import get_db
from app.models.enums import TrainingMediaType, UserRole
from app.models.student import Student
from app.models.training import (
    TrainingPlan,
    TrainingPlanExercise,
    TrainingPlanExerciseMedia,
    TrainingPlanShareLink,
)
from app.models.user import User
from app.schemas.common import APIMessage
from app.schemas.training import (
    PublicTrainingPlanExercise,
    PublicTrainingPlanMedia,
    PublicTrainingPlanRead,
    TrainingPlanCreate,
    TrainingPlanExerciseCreate,
    TrainingPlanExerciseMediaRead,
    TrainingPlanExerciseMediaUpdate,
    TrainingPlanExerciseRead,
    TrainingPlanExerciseUpdate,
    TrainingPlanRead,
    TrainingPlanShareLinkCreate,
    TrainingPlanShareLinkRead,
    TrainingPlanUpdate,
)
from app.services.audit import model_snapshot, record_audit

router = APIRouter(tags=["training"])

TRAINING_EDIT_ROLES = (UserRole.ADMIN, UserRole.PROFESSOR)
TRAINING_VIEW_ROLES = (UserRole.ADMIN, UserRole.PROFESSOR, UserRole.RECEPCAO)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def with_training_plan_options(stmt):
    return stmt.options(
        selectinload(TrainingPlan.student),
        selectinload(TrainingPlan.exercises).selectinload(TrainingPlanExercise.media),
    )


def get_training_plan_or_404(db: Session, training_plan_id: int) -> TrainingPlan:
    plan = db.scalar(with_training_plan_options(select(TrainingPlan).where(TrainingPlan.id == training_plan_id)))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ficha de treino nao encontrada.")
    return plan


def get_exercise_or_404(db: Session, exercise_id: int) -> TrainingPlanExercise:
    exercise = db.scalar(
        select(TrainingPlanExercise)
        .where(TrainingPlanExercise.id == exercise_id)
        .options(selectinload(TrainingPlanExercise.media), selectinload(TrainingPlanExercise.training_plan))
    )
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercicio nao encontrado.")
    return exercise


def public_url_for(token: str) -> str:
    return f"{settings.frontend_public_url.rstrip('/')}/treino/{token}"


def share_link_response(link: TrainingPlanShareLink) -> TrainingPlanShareLinkRead:
    return TrainingPlanShareLinkRead(
        id=link.id,
        training_plan_id=link.training_plan_id,
        token=link.token,
        public_url=public_url_for(link.token),
        is_active=link.is_active,
        expires_at=link.expires_at,
        created_at=link.created_at,
        revoked_at=link.revoked_at,
    )


def is_expired(expires_at: datetime | None) -> bool:
    if expires_at is None:
        return False
    value = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    return value <= utcnow()


def active_share_link(db: Session, training_plan_id: int) -> TrainingPlanShareLink | None:
    links = db.scalars(
        select(TrainingPlanShareLink)
        .where(
            TrainingPlanShareLink.training_plan_id == training_plan_id,
            TrainingPlanShareLink.is_active.is_(True),
            TrainingPlanShareLink.revoked_at.is_(None),
        )
        .order_by(TrainingPlanShareLink.created_at.desc())
    ).all()
    for link in links:
        if not is_expired(link.expires_at):
            return link
    return None


def validate_external_url(media_type: TrainingMediaType, external_url: str | None) -> str:
    url = (external_url or "").strip()
    if not url:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe a URL da midia.")
    if not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="URL de midia invalida.")
    if media_type not in {TrainingMediaType.EXTERNAL_IMAGE, TrainingMediaType.EXTERNAL_VIDEO}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use EXTERNAL_IMAGE ou EXTERNAL_VIDEO para URL externa.",
        )
    return url


def validate_thumbnail_url(thumbnail_url: str | None) -> str | None:
    """thumbnail_url e sempre um link (nunca upload); exige esquema http(s) para evitar
    URIs perigosas (ex.: javascript:) mesmo que o uso atual seja so leitura em <img>."""
    url = (thumbnail_url or "").strip()
    if not url:
        return None
    if not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="URL de capa invalida.")
    return url


def delete_uploaded_file(file_url: str | None) -> None:
    """Remove do disco um arquivo previamente salvo por save_uploaded_image, se existir.
    Nao falha a requisicao se o arquivo ja tiver sido removido por outro motivo."""
    if not file_url or not file_url.startswith("/uploads/training-media/"):
        return
    relative = file_url.removeprefix("/uploads/")
    target = Path(settings.upload_dir) / relative
    try:
        target.unlink(missing_ok=True)
    except OSError:
        pass


async def save_uploaded_image(file: UploadFile) -> str:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS or file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie apenas imagens JPG, PNG ou WEBP.",
        )

    # Le em blocos e aborta assim que ultrapassar o limite, em vez de carregar um
    # upload arbitrariamente grande inteiro na memoria antes de checar o tamanho.
    chunk_size = 1024 * 1024
    max_bytes = settings.training_media_max_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Arquivo muito grande.")
        chunks.append(chunk)
    content = b"".join(chunks)

    upload_root = Path(settings.upload_dir) / "training-media"
    upload_root.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_urlsafe(18)}{extension}"
    target = upload_root / filename
    target.write_bytes(content)
    return f"/uploads/training-media/{filename}"


@router.get("/students/{student_id}/training-plans", response_model=list[TrainingPlanRead])
def list_student_training_plans(
    student_id: int,
    _: User = Depends(require_roles(*TRAINING_VIEW_ROLES)),
    db: Session = Depends(get_db),
) -> list[TrainingPlan]:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    return list(
        db.scalars(
            with_training_plan_options(
                select(TrainingPlan).where(TrainingPlan.student_id == student_id).order_by(TrainingPlan.created_at.desc())
            )
        ).all()
    )


@router.post("/students/{student_id}/training-plans", response_model=TrainingPlanRead, status_code=status.HTTP_201_CREATED)
def create_training_plan(
    student_id: int,
    payload: TrainingPlanCreate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlan:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno nao encontrado.")
    plan = TrainingPlan(**payload.model_dump(), student_id=student_id, created_by_id=current_user.id)
    db.add(plan)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_PLAN",
        entity_id=plan.id,
        action="CREATE",
        summary=f"Ficha de treino criada para {student.name}: {plan.name}.",
        after=model_snapshot(plan),
    )
    db.commit()
    return get_training_plan_or_404(db, plan.id)


@router.get("/training-plans/{training_plan_id}", response_model=TrainingPlanRead)
def get_training_plan(
    training_plan_id: int,
    _: User = Depends(require_roles(*TRAINING_VIEW_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlan:
    return get_training_plan_or_404(db, training_plan_id)


@router.patch("/training-plans/{training_plan_id}", response_model=TrainingPlanRead)
def update_training_plan(
    training_plan_id: int,
    payload: TrainingPlanUpdate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlan:
    plan = get_training_plan_or_404(db, training_plan_id)
    before = model_snapshot(plan)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_PLAN",
        entity_id=plan.id,
        action="UPDATE",
        summary=f"Ficha de treino atualizada: {plan.name}.",
        before=before,
        after=model_snapshot(plan),
    )
    db.commit()
    return get_training_plan_or_404(db, plan.id)


@router.post("/training-plans/{training_plan_id}/deactivate", response_model=APIMessage)
def deactivate_training_plan(
    training_plan_id: int,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> APIMessage:
    plan = get_training_plan_or_404(db, training_plan_id)
    before = model_snapshot(plan)
    plan.is_active = False
    for link in plan.share_links:
        if link.is_active:
            link.is_active = False
            link.revoked_at = utcnow()
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_PLAN",
        entity_id=plan.id,
        action="DEACTIVATE",
        summary=f"Ficha de treino inativada: {plan.name}.",
        before=before,
        after=model_snapshot(plan),
    )
    db.commit()
    return APIMessage(message="Ficha de treino inativada.")


@router.post("/training-plans/{training_plan_id}/exercises", response_model=TrainingPlanExerciseRead, status_code=status.HTTP_201_CREATED)
def create_training_exercise(
    training_plan_id: int,
    payload: TrainingPlanExerciseCreate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanExercise:
    plan = get_training_plan_or_404(db, training_plan_id)
    exercise = TrainingPlanExercise(**payload.model_dump(), training_plan_id=plan.id)
    db.add(exercise)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_EXERCISE",
        entity_id=exercise.id,
        action="CREATE",
        summary=f"Exercicio adicionado a ficha {plan.name}: {exercise.name}.",
        after=model_snapshot(exercise),
    )
    db.commit()
    db.refresh(exercise)
    return exercise


@router.patch("/training-plan-exercises/{exercise_id}", response_model=TrainingPlanExerciseRead)
def update_training_exercise(
    exercise_id: int,
    payload: TrainingPlanExerciseUpdate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanExercise:
    exercise = get_exercise_or_404(db, exercise_id)
    before = model_snapshot(exercise)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_EXERCISE",
        entity_id=exercise.id,
        action="UPDATE",
        summary=f"Exercicio atualizado: {exercise.name}.",
        before=before,
        after=model_snapshot(exercise),
    )
    db.commit()
    db.refresh(exercise)
    return exercise


@router.post("/training-plan-exercises/{exercise_id}/deactivate", response_model=APIMessage)
def deactivate_training_exercise(
    exercise_id: int,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> APIMessage:
    exercise = get_exercise_or_404(db, exercise_id)
    before = model_snapshot(exercise)
    exercise.is_active = False
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_EXERCISE",
        entity_id=exercise.id,
        action="DEACTIVATE",
        summary=f"Exercicio inativado: {exercise.name}.",
        before=before,
        after=model_snapshot(exercise),
    )
    db.commit()
    return APIMessage(message="Exercicio inativado.")


@router.post("/training-plans/{training_plan_id}/share-link", response_model=TrainingPlanShareLinkRead)
def create_share_link(
    training_plan_id: int,
    payload: TrainingPlanShareLinkCreate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanShareLinkRead:
    plan = get_training_plan_or_404(db, training_plan_id)
    if not plan.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ficha de treino inativa.")
    current = active_share_link(db, training_plan_id)
    if current:
        return share_link_response(current)
    token = secrets.token_urlsafe(32)
    while db.scalar(select(TrainingPlanShareLink).where(TrainingPlanShareLink.token == token)) is not None:
        token = secrets.token_urlsafe(32)
    link = TrainingPlanShareLink(
        training_plan_id=plan.id,
        token=token,
        is_active=True,
        expires_at=payload.expires_at,
        created_by_user_id=current_user.id,
    )
    db.add(link)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_SHARE_LINK",
        entity_id=link.id,
        action="CREATE",
        summary=f"Link publico gerado para ficha {plan.name}.",
        after=model_snapshot(link),
    )
    db.commit()
    db.refresh(link)
    return share_link_response(link)


@router.get("/training-plans/{training_plan_id}/share-link", response_model=TrainingPlanShareLinkRead | None)
def get_share_link(
    training_plan_id: int,
    _: User = Depends(require_roles(*TRAINING_VIEW_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanShareLinkRead | None:
    get_training_plan_or_404(db, training_plan_id)
    link = active_share_link(db, training_plan_id)
    return share_link_response(link) if link else None


@router.post("/training-plans/{training_plan_id}/share-link/revoke", response_model=APIMessage)
def revoke_share_link(
    training_plan_id: int,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> APIMessage:
    plan = get_training_plan_or_404(db, training_plan_id)
    link = active_share_link(db, training_plan_id)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link ativo nao encontrado.")
    before = model_snapshot(link)
    link.is_active = False
    link.revoked_at = utcnow()
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_SHARE_LINK",
        entity_id=link.id,
        action="REVOKE",
        summary=f"Link publico revogado para ficha {plan.name}.",
        before=before,
        after=model_snapshot(link),
    )
    db.commit()
    return APIMessage(message="Link revogado.")


@router.post("/training-plan-exercises/{exercise_id}/media", response_model=TrainingPlanExerciseMediaRead, status_code=status.HTTP_201_CREATED)
async def create_exercise_media(
    exercise_id: int,
    media_type: TrainingMediaType = Form(...),
    external_url: str | None = Form(default=None),
    thumbnail_url: str | None = Form(default=None),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    sort_order: int = Form(default=0),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanExerciseMedia:
    exercise = get_exercise_or_404(db, exercise_id)
    # Valida tudo que pode falhar ANTES de gravar o upload em disco, para nao
    # deixar um arquivo orfao caso um campo posterior seja invalido.
    clean_thumbnail_url = validate_thumbnail_url(thumbnail_url)
    file_url: str | None = None
    clean_external_url: str | None = None
    if file is not None:
        if media_type != TrainingMediaType.IMAGE:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Upload local neste MVP aceita apenas imagem. Para video, use URL externa.",
            )
        file_url = await save_uploaded_image(file)
    else:
        clean_external_url = validate_external_url(media_type, external_url)

    media = TrainingPlanExerciseMedia(
        training_plan_exercise_id=exercise.id,
        media_type=media_type,
        file_url=file_url,
        external_url=clean_external_url,
        thumbnail_url=clean_thumbnail_url,
        title=title.strip() if title else None,
        description=description.strip() if description else None,
        sort_order=sort_order,
        is_active=True,
        created_by_user_id=current_user.id,
    )
    db.add(media)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_MEDIA",
        entity_id=media.id,
        action="CREATE",
        summary=f"Midia adicionada ao exercicio {exercise.name}.",
        after=model_snapshot(media),
    )
    db.commit()
    db.refresh(media)
    return media


@router.get("/training-plan-exercises/{exercise_id}/media", response_model=list[TrainingPlanExerciseMediaRead])
def list_exercise_media(
    exercise_id: int,
    _: User = Depends(require_roles(*TRAINING_VIEW_ROLES)),
    db: Session = Depends(get_db),
) -> list[TrainingPlanExerciseMedia]:
    get_exercise_or_404(db, exercise_id)
    return list(
        db.scalars(
            select(TrainingPlanExerciseMedia)
            .where(TrainingPlanExerciseMedia.training_plan_exercise_id == exercise_id)
            .order_by(TrainingPlanExerciseMedia.sort_order, TrainingPlanExerciseMedia.id)
        ).all()
    )


@router.patch("/training-plan-exercise-media/{media_id}", response_model=TrainingPlanExerciseMediaRead)
def update_exercise_media(
    media_id: int,
    payload: TrainingPlanExerciseMediaUpdate,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> TrainingPlanExerciseMedia:
    media = db.get(TrainingPlanExerciseMedia, media_id)
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Midia nao encontrada.")
    before = model_snapshot(media)
    updates = payload.model_dump(exclude_unset=True)
    if "thumbnail_url" in updates:
        updates["thumbnail_url"] = validate_thumbnail_url(updates["thumbnail_url"])
    previous_file_url = media.file_url
    if "external_url" in updates and updates["external_url"] is not None:
        media_type = updates.get("media_type") or media.media_type
        updates["external_url"] = validate_external_url(media_type, updates["external_url"])
        updates["file_url"] = None
    for field, value in updates.items():
        setattr(media, field, value.strip() if isinstance(value, str) else value)
    # Se a midia trocou de upload local para URL externa, remove o arquivo antigo
    # do disco para nao deixa-lo orfao (nunca mais referenciado por nenhum registro).
    if previous_file_url and media.file_url != previous_file_url:
        delete_uploaded_file(previous_file_url)
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_MEDIA",
        entity_id=media.id,
        action="UPDATE",
        summary=f"Midia de treino atualizada #{media.id}.",
        before=before,
        after=model_snapshot(media),
    )
    db.commit()
    db.refresh(media)
    return media


@router.post("/training-plan-exercise-media/{media_id}/deactivate", response_model=APIMessage)
def deactivate_exercise_media(
    media_id: int,
    current_user: User = Depends(require_roles(*TRAINING_EDIT_ROLES)),
    db: Session = Depends(get_db),
) -> APIMessage:
    media = db.get(TrainingPlanExerciseMedia, media_id)
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Midia nao encontrada.")
    before = model_snapshot(media)
    media.is_active = False
    db.flush()
    record_audit(
        db,
        current_user,
        entity_type="TRAINING_MEDIA",
        entity_id=media.id,
        action="DEACTIVATE",
        summary=f"Midia de treino inativada #{media.id}.",
        before=before,
        after=model_snapshot(media),
    )
    db.commit()
    return APIMessage(message="Midia inativada.")


@router.get("/public/training-plans/{token}", response_model=PublicTrainingPlanRead)
def public_training_plan(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> PublicTrainingPlanRead:
    link = db.scalar(
        select(TrainingPlanShareLink)
        .where(TrainingPlanShareLink.token == token)
        .options(
            selectinload(TrainingPlanShareLink.training_plan)
            .selectinload(TrainingPlan.exercises)
            .selectinload(TrainingPlanExercise.media),
            selectinload(TrainingPlanShareLink.training_plan).selectinload(TrainingPlan.student),
        )
    )
    if link is None or not link.is_active or link.revoked_at is not None or is_expired(link.expires_at):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link de treino invalido ou expirado.")
    plan = link.training_plan
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ficha de treino indisponivel.")

    def absolute_upload_url(url: str | None) -> str | None:
        if not url or url.startswith("http://") or url.startswith("https://"):
            return url
        return str(request.base_url).rstrip("/") + url

    exercises = [
        PublicTrainingPlanExercise(
            name=exercise.name,
            muscle_group=exercise.muscle_group,
            sets=exercise.sets,
            repetitions=exercise.repetitions,
            load=exercise.load,
            rest=exercise.rest,
            notes=exercise.notes,
            sort_order=exercise.sort_order,
            media=[
                PublicTrainingPlanMedia(
                    media_type=media.media_type,
                    file_url=absolute_upload_url(media.file_url),
                    external_url=media.external_url,
                    thumbnail_url=absolute_upload_url(media.thumbnail_url),
                    title=media.title,
                    description=media.description,
                    sort_order=media.sort_order,
                )
                for media in sorted(exercise.media, key=lambda item: (item.sort_order, item.id))
                if media.is_active
            ],
        )
        for exercise in sorted(plan.exercises, key=lambda item: (item.sort_order, item.id))
        if exercise.is_active
    ]
    return PublicTrainingPlanRead(
        academy_name=settings.app_name,
        academy_logo_url=f"{settings.frontend_public_url.rstrip('/')}/logo.png",
        student_name=plan.student.name,
        plan_name=plan.name,
        objective=plan.objective,
        start_date=plan.start_date,
        reassessment_date=plan.reassessment_date,
        notes=plan.notes,
        exercises=exercises,
    )
