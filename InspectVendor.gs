function inspectVendorSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Vender");
  if (!sheet) sheet = ss.getSheetByName("Vendor");
  
  if (sheet) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log("Sheet Name: " + sheet.getName());
    console.log("Headers: " + JSON.stringify(headers));
    
    // Preview first row of data
    if (sheet.getLastRow() > 1) {
        var firstRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
        console.log("First Row: " + JSON.stringify(firstRow));
    }
  } else {
    console.log("No Vender or Vendor sheet found.");
    var allSheets = ss.getSheets().map(s => s.getName());
    console.log("Available sheets: " + JSON.stringify(allSheets));
  }
}
