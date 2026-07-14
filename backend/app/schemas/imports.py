from pydantic import BaseModel


class ImportErrorRow(BaseModel):
    row: int
    message: str


class StudentImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[ImportErrorRow]
