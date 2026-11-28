# Writes tests/fixtures/sales-two-row-header.xlsx and sales-center-across.xlsx with
# openpyxl (pip install openpyxl). Run once; the files are committed.
import os
import openpyxl
from openpyxl.styles import Alignment
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = [["Region", "Rep", "Q1", None, "Q2", None],
        [None, None, "Revenue", "Cost", "Revenue", "Cost"],
        ["North", "Ana", 100, 60, 120, 70],
        ["North", "Bo", 90, 50, 80, 40],
        ["South", "Cy", 70, 30, 75, 35]]

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sales"
for row in ROWS: ws.append(row)
for r in ["A1:A2", "B1:B2", "C1:D1", "E1:F1"]:
    ws.merge_cells(r)
wb.save(os.path.join(root, "tests", "fixtures", "sales-two-row-header.xlsx"))

# The same report with "Q1" and "Q2" centered across their columns instead of merged.
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sales"
for row in ROWS: ws.append(row)
for r in ["A1:A2", "B1:B2"]:
    ws.merge_cells(r)
for a in ["C1", "D1", "E1", "F1"]:
    ws[a].alignment = Alignment(horizontal="centerContinuous")
wb.save(os.path.join(root, "tests", "fixtures", "sales-center-across.xlsx"))
