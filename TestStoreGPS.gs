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
// findStoreSheet() lives in TripPlan01.gs — Apps Script shares one global namespace, so a second
// definition here would silently override it depending on file load order.
