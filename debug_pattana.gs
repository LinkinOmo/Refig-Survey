function debugPattanaPermissions() {
  var sheet = findEmployeeSheet();
  if (!sheet) {
    console.log("Employee Sheet not found");
    return;
  }
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  console.log("Headers:", headers);
  
  // Find Indices
  var empIdIdx = -1, nameIdx = -1, managerIdx = -1, emailIdx = -1, userTypeIdx = -1;
  
  for(var i=0; i<headers.length; i++) {
    var h = String(headers[i]).trim().toLowerCase();
    if(h === "employee id") empIdIdx = i;
    if(h === "full name") nameIdx = i;
    if(h === "direct manager") managerIdx = i;
    if(h === "email") emailIdx = i;
    if(h === "user type" || h.includes("type")) userTypeIdx = i;
  }
  
  console.log("Indices:", {empIdIdx, nameIdx, managerIdx, emailIdx, userTypeIdx});
  
  var pattana = null;
  var teerawat = null;
  
  // Search for Pattana and Teerawat
  for(var i=1; i<data.length; i++) {
    var row = data[i];
    var name = String(row[nameIdx]).toLowerCase();
    
    if(name.includes("pattana") || name.includes("พัฒนา")) {
      pattana = {
        row: i+1,
        name: row[nameIdx],
        empId: row[empIdIdx],
        manager: row[managerIdx],
        email: row[emailIdx],
        userType: (userTypeIdx > -1) ? row[userTypeIdx] : "N/A"
      };
    }
    
    if(name.includes("teerawat") || name.includes("ธีระวัฒน์")) {
      teerawat = {
        row: i+1,
        name: row[nameIdx],
        empId: row[empIdIdx],
        manager: row[managerIdx],
        email: row[emailIdx],
        userType: (userTypeIdx > -1) ? row[userTypeIdx] : "N/A"
      };
    }
  }
  
  console.log("=== PATTANA INFO ===");
  console.log(JSON.stringify(pattana, null, 2));
  
  console.log("=== TEERAWAT INFO (Sample Peer) ===");
  console.log(JSON.stringify(teerawat, null, 2));
  
  // Check if Pattana is listed as manager for anyone
  console.log("=== WHO REPORTS TO PATTANA? ===");
  if(pattana) {
    var subordinates = [];
    for(var i=1; i<data.length; i++) {
        var row = data[i];
        if(String(row[managerIdx]).trim() === String(pattana.name).trim()) {
            subordinates.push(row[nameIdx]);
        }
    }
    console.log("Subordinates count:", subordinates.length);
    console.log("Subordinates:", subordinates);
  }
  
  // Logic Check Simulation
  if (pattana && teerawat) {
      console.log("=== PERMISSION SIMULATION ===");
      console.log("If Teerawat makes a request, can Pattana approve?");
      
      var isDirectManager = (String(teerawat.manager).trim() === String(pattana.name).trim());
      console.log("- Is Direct Manager:", isDirectManager);
      
      // Admin Check
      var isAdmin = (String(pattana.userType).toLowerCase().trim() === 'admin');
      console.log("- Is Admin (DB):", isAdmin);
      
      var canApprove = isDirectManager || isAdmin;
      console.log("-> Result:", canApprove);
  }
}
