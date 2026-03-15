function test_getAllTripPlansForCalendar() {
    // Simulate user email
    var userEmail = "barramee.mah@bigc.co.th"; // Use a known email or leave empty to test fallback
    
    console.log("Testing getAllTripPlansForCalendar for: " + userEmail);
    
    var result = getAllTripPlansForCalendar(userEmail);
    
    console.log("Is Admin: " + result.isAdmin);
    if (result.error) {
        console.error("Error: " + result.error);
    } else {
        console.log("Trips Found: " + (result.trips ? result.trips.length : 0));
        if (result.trips && result.trips.length > 0) {
            console.log("First Trip Sample: " + JSON.stringify(result.trips[0]));
        }
    }
}
