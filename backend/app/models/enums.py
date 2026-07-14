from enum import Enum


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    RECEPCAO = "RECEPCAO"
    PROFESSOR = "PROFESSOR"


class StudentStatus(str, Enum):
    ATIVO = "ATIVO"
    INATIVO = "INATIVO"
    INADIMPLENTE = "INADIMPLENTE"


class PaymentStatus(str, Enum):
    PENDENTE = "PENDENTE"
    PAGO = "PAGO"
    ATRASADO = "ATRASADO"
    CANCELADO = "CANCELADO"


class PaymentMethod(str, Enum):
    DINHEIRO = "DINHEIRO"
    PIX = "PIX"
    CARTAO = "CARTAO"
    OUTRO = "OUTRO"


class ProductStatus(str, Enum):
    ATIVO = "ATIVO"
    INATIVO = "INATIVO"


class StockMovementType(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA_VENDA = "SAIDA_VENDA"
    AJUSTE = "AJUSTE"


class TrainingMediaType(str, Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    EXTERNAL_IMAGE = "EXTERNAL_IMAGE"
    EXTERNAL_VIDEO = "EXTERNAL_VIDEO"
