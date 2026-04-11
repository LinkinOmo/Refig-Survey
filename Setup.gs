function setup() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Optional: Rename the sheet
  sheet.setName("Employee_Database");
  
  // Define Headers
  var headers = [
    "Timestamp", 
    "Employee ID",
    "Full Name", 
    "Nickname",
    "Direct Manager",
    "Position", 
    "Email", 
    "Phone", 
    "Zone", 
    "Personal Info", 
    "Education", 
    "Self Introduction",
    "Photo URL"
  ];
  
  // Clear existing content (Safe mode: rename this line if you want to keep data)
  // sheet.clear(); 
  
  // Set Headers at Row 1
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Styling
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.getRange(1, 1, 1, headers.length).setBackground("#d9ead3"); // Light green
  sheet.setFrozenRows(1);
  
  Logger.log("Database initialized successfully!");
}

function setupNewTables() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Performance Review Sheet
  setupSheet(ss, "Performance_Review", [
    "Employee ID", "Year", "Period", "Grade", "Score", "Reviewer", "Comments"
  ]);

  // 2. Setup Talent Data Sheet
  setupSheet(ss, "Talent_Data", [
    "Employee ID", "Performance Rating", "Potential Rating", "Readiness", "Strengths", "Development Needs"
  ]);

  // 3. Setup Assignments Sheet
  setupSheet(ss, "Assignments", [
    "Employee ID", "Project Name", "Role", "Status", "Start Date", "End Date", "Achievements"
  ]);
  
  Logger.log("New tables created!");
}

function setupSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#cfe2f3"); // Light Blue
    sheet.setFrozenRows(1);
  } else {
    Logger.log("Sheet " + sheetName + " already exists.");
  }
}
