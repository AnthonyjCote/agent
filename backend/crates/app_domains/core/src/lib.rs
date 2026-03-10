pub mod errors;
pub mod ids;

pub type DomainResult<T> = Result<T, errors::DomainError>;
