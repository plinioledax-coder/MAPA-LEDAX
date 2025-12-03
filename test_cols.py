import pandas as pd
import re

df = pd.read_excel("data/Amostra_DB_GERAL2.xlsx")

df.columns = [re.sub(r"[^a-z0-9]+", "_", c.lower()) for c in df.columns]

print("\n=== COLUNAS NORMALIZADAS ===")
for c in df.columns:
    print(c)
