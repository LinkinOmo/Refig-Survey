var DEBUG_EMAIL = "admin@example.com"; // Replace with a valid email if needed, or rely on Session.getActiveUser() if running manually

function debugTripPlanData() {
    console.log("=== Debugging Trip Plan Data ===");
    
    // 1. Check Store DB
    console.log("--- Loading Store DB ---");
    var storeData = loadStoreDatabase();
    console.log("Store DB GPS Entries: " + Object.keys(storeData.gpsMap).length);
    console.log("Sample Store Name Keys: " + Object.keys(storeData.nameMap).slice(0, 5).join(", "));
    
    // 2. Check Trip Plans
    console.log("--- Fetching Trip Plans ---");
    var jsonStr = getAllTripPlansReport(DEBUG_EMAIL);
    var res = JSON.parse(jsonStr);
    
    if (res.error) {
        console.error("Error returned from getAllTripPlansReport: " + res.error);
        return;
    }
    
    var orders = res.orders || [];
    console.log("Total Orders Fetched: " + orders.length);
    
    if (orders.length > 0) {
        var withGps = orders.filter(function(o) { return o.gps && o.gps.includes(','); });
        console.log("Orders with GPS: " + withGps.length);
        
        // Log first few orders to see why GPS might be missing
        console.log("--- Sample Orders ---");
        orders.slice(0, 5).forEach(function(o, i) {
            console.log("Order #" + i + ": Station='" + o.station + "', GPS='" + o.gps + "', StoreName='" + o.storeName + "'");
        });
        
        // Check for specific station mismatch if GPS is missing
        var withoutGps = orders.filter(function(o) { return !o.gps; });
        if (withoutGps.length > 0) {
             console.log("--- Sample Orders WITHOUT GPS ---");
             withoutGps.slice(0, 5).forEach(function(o, i) {
                console.log("NoGPS Order #" + i + ": Station='" + o.station + "'");
                // Try to debug why it didn't match
                var key = o.station;
                var id = key.split(" ")[0];
                console.log("   -> Lookup Key: '" + key + "', ID: '" + id + "'");
                console.log("   -> In GPS Map? Key: " + (storeData.gpsMap[key] ? "YES" : "NO") + ", ID: " + (storeData.gpsMap[id] ? "YES" : "NO"));
            });
        }
    } else {
        console.log("No orders found.");
    }
}
