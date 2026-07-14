from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import TrainingMediaType
from app.schemas.student import StudentRead


class TrainingPlanBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    objective: str | None = Field(default=None, max_length=255)
    start_date: date | None = None
    reassessment_date: date | None = None
    notes: str | None = None
    is_active: bool = True


class TrainingPlanCreate(TrainingPlanBase):
    pass


class TrainingPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    objective: str | None = Field(default=None, max_length=255)
    start_date: date | None = None
    reassessment_date: date | None = None
    notes: str | None = None
    is_active: bool | None = None


class TrainingPlanExerciseBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    muscle_group: str | None = Field(default=None, max_length=120)
    sets: str | None = Field(default=None, max_length=40)
    repetitions: str | None = Field(default=None, max_length=80)
    load: str | None = Field(default=None, max_length=80)
    rest: str | None = Field(default=None, max_length=80)
    notes: str | None = None
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class TrainingPlanExerciseCreate(TrainingPlanExerciseBase):
    pass


class TrainingPlanExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    muscle_group: str | None = Field(default=None, max_length=120)
    sets: str | None = Field(default=None, max_length=40)
    repetitions: str | None = Field(default=None, max_length=80)
    load: str | None = Field(default=None, max_length=80)
    rest: str | None = Field(default=None, max_length=80)
    notes: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class TrainingPlanExerciseMediaBase(BaseModel):
    media_type: TrainingMediaType
    file_url: str | None = Field(default=None, max_length=500)
    external_url: str | None = Field(default=None, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    title: str | None = Field(default=None, max_length=160)
    description: str | None = None
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True

    @field_validator("external_url", "file_url", "thumbnail_url")
    @classmethod
    def trim_url(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_media_source(self) -> "TrainingPlanExerciseMediaBase":
        has_file = bool(self.file_url)
        has_external = bool(self.external_url)
        if self.media_type in {TrainingMediaType.EXTERNAL_IMAGE, TrainingMediaType.EXTERNAL_VIDEO} and not has_external:
            raise ValueError("Informe a URL externa da midia.")
        if self.media_type in {TrainingMediaType.IMAGE, TrainingMediaType.VIDEO} and not has_file:
            raise ValueError("Informe o arquivo da midia.")
        if has_file and has_external:
            raise ValueError("Use arquivo ou URL externa, nao ambos.")
        return self


class TrainingPlanExerciseMediaCreate(TrainingPlanExerciseMediaBase):
    pass


class TrainingPlanExerciseMediaUpdate(BaseModel):
    media_type: TrainingMediaType | None = None
    external_url: str | None = Field(default=None, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    title: str | None = Field(default=None, max_length=160)
    description: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class TrainingPlanExerciseMediaRead(TrainingPlanExerciseMediaBase):
    id: int
    training_plan_exercise_id: int
    created_at: datetime
    created_by_user_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanExerciseRead(TrainingPlanExerciseBase):
    id: int
    training_plan_id: int
    created_at: datetime
    updated_at: datetime
    media: list[TrainingPlanExerciseMediaRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanRead(TrainingPlanBase):
    id: int
    student_id: int
    created_by_id: int | None = None
    created_at: datetime
    updated_at: datetime
    student: StudentRead | None = None
    exercises: list[TrainingPlanExerciseRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanShareLinkRead(BaseModel):
    id: int
    training_plan_id: int
    token: str
    public_url: str
    is_active: bool
    expires_at: datetime | None = None
    created_at: datetime
    revoked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanShareLinkCreate(BaseModel):
    expires_at: datetime | None = None


class PublicTrainingPlanMedia(BaseModel):
    media_type: TrainingMediaType
    file_url: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    title: str | None = None
    description: str | None = None
    sort_order: int


class PublicTrainingPlanExercise(BaseModel):
    name: str
    muscle_group: str | None = None
    sets: str | None = None
    repetitions: str | None = None
    load: str | None = None
    rest: str | None = None
    notes: str | None = None
    sort_order: int
    media: list[PublicTrainingPlanMedia] = Field(default_factory=list)


class PublicTrainingPlanRead(BaseModel):
    academy_name: str
    academy_logo_url: str | None = None
    student_name: str
    plan_name: str
    objective: str | None = None
    start_date: date | None = None
    reassessment_date: date | None = None
    notes: str | None = None
    exercises: list[PublicTrainingPlanExercise]
