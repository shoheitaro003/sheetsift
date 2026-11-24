# Writes tests/fixtures/orders-merged.xlsx with openpyxl (pip install openpyxl). Run once; the file is committed.
import os
import openpyxl
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Orders"
ws.append(["Region", "Rep", "Invoice", "Amount"])
ws.append(["North", "Ana", "INV-1", 100])
ws.append([None, "Bo", "INV-2", 90])
ws.append([None, "Cy", "INV-3", 70])
ws.append(["South", "Di", "INV-4", 60])
ws.append(["Note: amounts in EUR", None, None, None])
ws.merge_cells("A2:A4"); ws.merge_cells("A6:D6")
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wb.save(os.path.join(root, "tests", "fixtures", "orders-merged.xlsx"))
