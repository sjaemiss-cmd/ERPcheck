
import pandas as pd
try:
    df = pd.read_csv('mapping.csv', encoding='euc-kr')
    with open('mapping_decoded.txt', 'w', encoding='utf-8') as f:
        f.write(df.to_string())
    print("Success")
except Exception as e:
    print(e)
