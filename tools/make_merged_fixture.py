# Writes tests/fixtures/sales-merged.xlsx with openpyxl (pip install openpyxl). Run once; the file is committed.
import openpyxl
wb=openpyxl.Workbook(); ws=wb.active; ws.title="Sales"
ws.append(["Region","Rep","Q1",None,"Q2",None])
ws.append([None,None,"Revenue","Cost","Revenue","Cost"])
ws.append(["North","Ana",100,40,120,50])
ws.append([None,"Bo",90,30,95,35])
ws.append(["South","Cy",70,20,80,25])
ws.append(["Note: figures in EUR",None,None,None,None,None])
ws.merge_cells("A1:A2"); ws.merge_cells("B1:B2"); ws.merge_cells("C1:D1"); ws.merge_cells("E1:F1")
ws.merge_cells("A3:A4"); ws.merge_cells("A6:F6")
import os; wb.save(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests/fixtures/sales-merged.xlsx"))
