from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Use SQLite for Heroku deployment (no external database required)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tsim.db")

# Heroku compatibility: if DATABASE_URL is from Heroku Postgres, use SQLite instead
if DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "sqlite:///./tsim.db"

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})

# Create SessionLocal class
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Create Base class
Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 