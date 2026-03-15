// Test function to check Store GPS data
function testStoreGPSLookup() {
  var storeSheet = findStoreSheet();
  
  if (!storeSheet) {
    Logger.log("ERROR: Store sheet not found!");
    return;
  }
  
  Logger.log("Found store sheet: " + storeSheet.getName());
  
  var storeData = storeSheet.getDataRange().getValues();
  Logger.log("Store sheet has " + storeData.length + " rows");
  
  // Show headers
  Logger.log("\n=== Store Sheet Headers ===");
  for (var i = 0; i < storeData[0].length; i++) {
    Logger.log("Column " + i + ": '" + storeData[0][i] + "'");
  }
  
  // Show first 3 stores
  Logger.log("\n=== First 3 Stores ===");
  for (var i = 1; i <= Math.min(3, storeData.length - 1); i++) {
    Logger.log("\nStore " + i + ":");
    Logger.log("  Column 0 (Name): " + storeData[i][0]);
    Logger.log("  Column 3 (Lat?): " + storeData[i][3]);
    Logger.log("  Column 4 (Lon?): " + storeData[i][4]);
  }
  
  // Test the lookup map
  Logger.log("\n=== Testing GPS Map ===");
  var storeGpsMap = {};
  for (var i = 1; i < storeData.length; i++) {
    var storeName = String(storeData[i][0]).trim();
    var lat = parseFloat(storeData[i][3]);
    var lon = parseFloat(storeData[i][4]);
    
    if (storeName && !isNaN(lat) && !isNaN(lon)) {
      storeGpsMap[storeName] = { lat: lat, lon: lon };
    }
  }
  
  Logger.log("Total stores in GPS map: " + Object.keys(storeGpsMap).length);
  Logger.log("First 5 store names in map:");
  var count = 0;
  for (var name in storeGpsMap) {
    Logger.log("  '" + name + "' -> " + storeGpsMap[name].lat + ", " + storeGpsMap[name].lon);
    count++;
    if (count >= 5) break;
  }
}

// Helper function (copy from Survey.gs)
function findStoreSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Store_Database");
    if (sheet) return sheet;

    // Fallback: Search for a sheet that looks like the Store DB
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        if (s.getLastRow() < 1) continue;
        var headers = s.getRange(1, 1, 1, Math.min(10, s.getLastColumn())).getValues()[0];
        // Look for store-related headers
        for (var j = 0; j < headers.length; j++) {
            var header = String(headers[j]).toLowerCase();
            if (header.indexOf("store") !== -1 || header.indexOf("latitude") !== -1 || header.indexOf("longitude") !== -1) {
                return s;
            }
        }
    }
    
    Logger.log("Could not identify Store Sheet.");
    return null;
}
