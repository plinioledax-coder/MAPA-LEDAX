import os

print("Working dir:", os.getcwd())

from database import DB_PATH

print("DB_PATH:", DB_PATH)
print("DB exists?", os.path.exists(DB_PATH))
