# Writes tests/fixtures/sales-two-row-header.xlsx with openpyxl (pip install openpyxl). Run once; the file is committed.
import os
import openpyxl
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sales"
ws.append(["Region", "Rep", "Q1", None, "Q2", None])
ws.append([None, None, "Revenue", "Cost", "Revenue", "Cost"])
ws.append(["North", "Ana", 100, 60, 120, 70])
ws.append([None, "Bo", 90, 50, 80, 40])
ws.append(["South", "Cy", 70, 30, 75, 35])
for r in ["A1:A2", "B1:B2", "C1:D1", "E1:F1", "A3:A4"]:
    ws.merge_cells(r)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wb.save(os.path.join(root, "tests", "fixtures", "sales-two-row-header.xlsx"))

# The same report with "Q1" and "Q2" centered across their columns instead of merged
# (Excel's Center Across Selection, stored as centerContinuous).
from openpyxl.styles import Alignment
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sales"
ws.append(["Region", "Rep", "Q1", None, "Q2", None])
ws.append([None, None, "Revenue", "Cost", "Revenue", "Cost"])
ws.append(["North", "Ana", 100, 60, 120, 70])
ws.append([None, "Bo", 90, 50, 80, 40])
ws.append(["South", "Cy", 70, 30, 75, 35])
for a in ["C1", "D1", "E1", "F1"]:
    ws[a].alignment = Alignment(horizontal="centerContinuous")
wb.save(os.path.join(root, "tests", "fixtures", "sales-center-across.xlsx"))
