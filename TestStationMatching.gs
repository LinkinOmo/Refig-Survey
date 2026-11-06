// Test function to check which stations from Trip_Plans match Store_Database
function testStationMatching() {
  // Get Trip_Plans data
  var tripSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
  if (!tripSheet) {
    Logger.log("ERROR: Trip_Plans sheet not found!");
    return;
  }
  
  var tripData = tripSheet.getDataRange().getValues();
  
  // Find Station column
  var stationIdx = -1;
  for (var j = 0; j < tripData[0].length; j++) {
    var header = String(tripData[0][j]).trim().toLowerCase();
    if (header === "station") {
      stationIdx = j;
      break;
    }
  }
  
  if (stationIdx === -1) {
    Logger.log("ERROR: Station column not found!");
    return;
  }
  
  // Collect unique station names
  var uniqueStations = {};
  for (var i = 1; i < tripData.length; i++) {
    var station = String(tripData[i][stationIdx]).trim();
    if (station) {
      uniqueStations[station] = true;
    }
  }
  
  Logger.log("Found " + Object.keys(uniqueStations).length + " unique stations in Trip_Plans");
  Logger.log("\n=== Sample Station Names ===");
  var count = 0;
  for (var station in uniqueStations) {
    Logger.log("  '" + station + "'");
    count++;
    if (count >= 10) break;
  }
  
  // Build store GPS map
  var storeSheet = findStoreSheet();
  if (!storeSheet) {
    Logger.log("ERROR: Store sheet not found!");
    return;
  }
  
  var storeData = storeSheet.getDataRange().getValues();
  var storeGpsMap = {};
  
  for (var i = 1; i < storeData.length; i++) {
    var storeId = String(storeData[i][2]).trim();
    var siteName = String(storeData[i][4]).trim();
    var lat = parseFloat(storeData[i][27]);
    var lon = parseFloat(storeData[i][28]);
    
    if (!isNaN(lat) && !isNaN(lon)) {
      if (storeId) storeGpsMap[storeId] = true;
      if (siteName) storeGpsMap[siteName] = true;
      if (storeId && siteName) storeGpsMap[storeId + " " + siteName] = true;
    }
  }
  
  Logger.log("\n=== Matching Results ===");
  var matched = 0;
  var unmatched = 0;
  var unmatchedList = [];
  
  for (var station in uniqueStations) {
    if (storeGpsMap[station]) {
      matched++;
    } else {
      unmatched++;
      if (unmatchedList.length < 10) {
        unmatchedList.push(station);
      }
    }
  }
  
  Logger.log("Matched: " + matched);
  Logger.log("Unmatched: " + unmatched);
  Logger.log("\n=== Unmatched Stations (first 10) ===");
  for (var i = 0; i < unmatchedList.length; i++) {
    Logger.log("  '" + unmatchedList[i] + "'");
  }
}

// findStoreSheet() lives in TripPlan01.gs — Apps Script shares one global namespace, so a second
// definition here would silently override it depending on file load order.
