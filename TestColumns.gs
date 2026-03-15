// Temporary test function to check Trip_Plans column names
function testTripPlansColumns() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
  if (!sheet) {
    Logger.log("Trip_Plans sheet not found!");
    return;
  }
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  Logger.log("=== Trip_Plans Column Headers ===");
  for (var i = 0; i < headers.length; i++) {
    Logger.log("Column " + i + ": '" + headers[i] + "'");
  }
  
  // Also show a sample row
  if (sheet.getLastRow() > 1) {
    var sampleRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log("\n=== Sample Row (Row 2) ===");
    for (var i = 0; i < headers.length; i++) {
      var value = sampleRow[i];
      var preview = String(value).substring(0, 100);
      Logger.log(headers[i] + ": " + preview);
    }
  }
}
