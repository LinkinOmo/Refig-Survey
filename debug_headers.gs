function logStoreHeaders() {
  var ss = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit");
  var sheet = ss.getSheets()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log("=== Store Database Headers ===");
  for (var i = 0; i < headers.length; i++) {
    Logger.log("Col " + (i + 1) + ": " + headers[i]);
  }
}
