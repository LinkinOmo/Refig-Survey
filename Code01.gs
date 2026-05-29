function doGet(e) {
  var page = e.parameter.page;
  var userEmail = Session.getActiveUser().getEmail();
  
  // LOGGING - Disabled to prevent logging Google Account Email (noise). 
  // We only log explicit 'Login' and 'Dashboard View' actions with App Identity now.
  /*
  try {
      logUserActivity(userEmail, "Visit", page || "index");
  } catch (err) {
      console.error("Logging failed", err);
  }
  */

  if (page == "report") {
    return HtmlService.createTemplateFromFile('report')
        .evaluate()
        .setTitle('Mini Big C - Staff Org Chart')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "admin-activity-dashboard") {
     return HtmlService.createTemplateFromFile('admin-activity-dashboard')
        .evaluate()
        .setTitle('Admin Activity Dashboard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "work-order-report") {
    return HtmlService.createTemplateFromFile('work-order-report')
        .evaluate()
        .setTitle('Mini Big C - Work Order Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "work-order-dashboard") {
    return HtmlService.createTemplateFromFile('work-order-dashboard')
        .evaluate()
        .setTitle('Work Order Dashboard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "bigc_work_order_report") {
    return HtmlService.createTemplateFromFile('bigc-work-order-report')
        .evaluate()
        .setTitle('Big C Work Order Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "survey_report") {
    return HtmlService.createTemplateFromFile('SurveyReport')
        .evaluate()
        .setTitle('Survey Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "trip-plan-report") {
    return HtmlService.createTemplateFromFile('trip-plan-report')
        .evaluate()
        .setTitle('Trip Plan Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "trip-plan-map") {
    return HtmlService.createTemplateFromFile('trip-plan-map')
        .evaluate()
        .setTitle('Trip Plan Map Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "aircon_survey_report") {
    var acTemplate = HtmlService.createTemplateFromFile('AirconSurveyReport');
    // Skip synchronous preload — getAirConSurveysReport() on a large sheet causes page-load
    // timeouts.  The page uses getAirconSurveyListSlim() asynchronously instead.
    acTemplate.preloadedData = null;
    return acTemplate.evaluate()
        .setTitle('Air Conditioner Survey Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "ref_survey_report") {
    var refTemplate = HtmlService.createTemplateFromFile('RefSurveyReport');
    // NOTE: Preloading synchronously here caused page-load timeouts when the
    // Ref_Survey_Database sheet is large.  The page has a built-in async
    // fallback (google.script.run.getRefSurveyReport) that is used whenever
    // preloadedData is null, so we skip the slow server-side fetch here.
    refTemplate.preloadedData = null;
    refTemplate.defaultTab = 'ref';
    return refTemplate.evaluate()
        .setTitle('Refrigerator Survey Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "np_survey_report") {
    var npTemplate = HtmlService.createTemplateFromFile('RefSurveyReport');
    npTemplate.preloadedData = null;
    npTemplate.defaultTab = 'np';
    return npTemplate.evaluate()
        .setTitle('New Product Survey Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "np_survey") {
    return HtmlService.createTemplateFromFile('np_survey')
        .evaluate()
        .setTitle('New Product Survey Form')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "trip-plan-calendar") {
    return HtmlService.createTemplateFromFile('trip-plan-calendar')
        .evaluate()
        .setTitle('Trip Plan Calendar')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "store-map") {
    return HtmlService.createTemplateFromFile('store_map_v2')
        .evaluate()
        .setTitle('Store Distribution Map')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "ref-ac-map") {
    return HtmlService.createTemplateFromFile('ref_ac_map')
        .evaluate()
        .setTitle('Refig & Aircon Survey Map')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "upload-schedule") {
    return HtmlService.createTemplateFromFile('upload-schedule')
        .evaluate()
        .setTitle('Survey Upload Schedule')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "safety-incident-report") {
    return HtmlService.createTemplateFromFile('safety-incident-report')
        .evaluate()
        .setTitle('Safety Incident Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "check-in") {
    return HtmlService.createTemplateFromFile('check_in')
        .evaluate()
        .setTitle('My Check-In')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "assignment-report") {
    return HtmlService.createTemplateFromFile('assignment-report')
        .evaluate()
        .setTitle('Assignment Report')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page == "ai-prediction") {
    return HtmlService.createTemplateFromFile('ai-prediction')
        .evaluate()
        .setTitle('AI Prediction Analysis')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page && page.trim().toLowerCase() == "survey-config") {
    Logger.log("Serving survey-config for page param: " + page);
    return HtmlService.createTemplateFromFile('survey-config')
        .evaluate()
        .setTitle('Survey Configuration')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else {
    Logger.log("Defaulting to index. Page param was: " + page);
    return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('Mini Big C - Employee Profile Registration')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// Helper to find the Employee Sheet dynamically based on headers
function findEmployeeSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Employee_Database");
    if (sheet) return sheet;

    // Fallback: Search for a sheet that looks like the Employee DB (has "Direct Manager" in header)
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        // Check first row, first few columns
        var headers = s.getRange(1, 1, 1, 15).getValues()[0];
        // "Direct Manager" is usually around index 4
        if (headers.indexOf("Direct Manager") !== -1 || headers.indexOf("Full Name") !== -1) {
             return s;
        }
    }
    
    // Last resort: Return first sheet (but log warning)
    console.warn("Could not identify Employee Sheet. Using first sheet.");
    return ss.getSheets()[0];
}

function getOrgChartData() {
  var sheet = findEmployeeSheet();
  var data = sheet.getDataRange().getValues();
  // Remove header
  data.shift(); 
  
  // Columns (0-based index):
  // 0: Timestamp, 1: EmpID, 2: Name, 3: Nickname, 4: ManagerName, 5: Position, 6: Email, 7: Phone, 8: Zone, 9: Info, 10: Edu, 11: Intro, 12: PhotoURL
  
  var nodes = [];
  var nodeMap = {}; 
  var rawData = []; // Store pre-processed row data
  var nameIndex = {}; // Map Name -> EmpID (for resolving managers)

  // 1. First Pass: Index all employees and prepare raw data
  data.forEach(function(row, index) {
    try {
        var empId = row[1] ? String(row[1]).trim() : "";
        var name = row[2] ? String(row[2]).trim() : "";
        
        // Skip empty rows
        if (!empId && !name) return;

        // If no EmpID, generate a temporary one to ensure every row has a unique ID
        if (!empId && name) {
            empId = "GEN_" + index + "_" + name.replace(/\s+/g, '');
        }

        if (empId) {
            // Store in index. normalizing name for lookup
            if (name) {
                nameIndex[name] = empId;
            }

            rawData.push({
                row: row,
                id: empId,
                name: name,
                managerName: row[4] ? String(row[4]).trim() : ""
            });
        }
    } catch (err) {
        console.error("Error processing row " + index + ": " + err);
    }
  });

  // 2. Second Pass: Build Nodes
  rawData.forEach(function(item) {
    try {
        var row = item.row;
        var empId = item.id; // Unique ID
        var name = item.name;
        var nickname = row[3];
        var managerName = item.managerName;
        var position = row[5];
        var photoUrl = row[12];

        // Format Photo URL
        var formattedPhotoUrl = photoUrl;
        if (photoUrl) {
             var pUrlStr = String(photoUrl);
             if (pUrlStr.indexOf('drive.google.com') !== -1) {
                var idMatch = pUrlStr.match(/[-\w]{25,}/);
                if (idMatch) {
                    formattedPhotoUrl = "https://drive.google.com/thumbnail?sz=w150&id=" + idMatch[0];
                }
             }
        }

        // Resolve Parent ID
        var parentId = "";
        if (managerName) {
            if (nameIndex[managerName]) {
                parentId = nameIndex[managerName]; // Found the manager's EmpID
            } else {
                parentId = managerName; // Manager not in list (Ghost Node), use Name as ID
            }
        }

        var node = {
            id: empId, // critical change: using EmpID
            parent: parentId,
            name: name + (nickname ? ' (' + nickname + ')' : ''),
            position: position,
            image: formattedPhotoUrl || 'https://cdn-icons-png.flaticon.com/512/847/847969.png',
            details: {
               empId: row[1],
               name: name,
               nickname: nickname,
               manager: managerName,
               position: position,
               email: row[6],
               phone: row[7],
               zone: row[8],
               info: row[9],
               intro: row[11],
               department: row[13] // Department
            }
        };
        
        nodes.push(node);
        nodeMap[empId] = true;
    } catch (err) {
        console.error("Error building node for " + item.name + ": " + err);
    }
  });

  // 3. Identify and Create Ghost Nodes (Managers not in the employee list)
  var ghostManagers = {};
  nodes.forEach(function(node) {
    // If parent exists (is not empty) AND parent is NOT in our nodeMap
    if (node.parent && !nodeMap[node.parent]) {
      ghostManagers[node.parent] = true;
    }
  });

  for (var managerName in ghostManagers) {
    nodes.push({
      id: managerName, // The ID is the name itself for ghost nodes
      parent: '', // Top level if unknown
      name: managerName + " ⚠️",
      position: 'Not Registered - Please add this person to the employee database',
      image: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      details: {
        empId: '',
        name: managerName,
        nickname: '',
        manager: '',
        position: 'Manager (Not Registered)',
        email: '',
        phone: '',
        zone: '',
        info: 'This person is referenced as a manager but has not been registered in the employee database. Please register them or update the manager name in their subordinates\' records.',
        intro: '',
        department: ''
      }
    });
  }
  
  var currentUserEmail = Session.getActiveUser().getEmail();
  return {
    nodes: nodes,
    currentUserEmail: currentUserEmail
  };
}

function updateEmployee(form) {
  var _wlock = _acquireWriteLock_();
  var sheet = findEmployeeSheet();
  var data = sheet.getDataRange().getValues(); 
  
  // Find row by EmpID (Col 1) or Name (Col 2)
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    // Check EmpID match
    if (form.empId && data[i][1].toString() == form.empId.toString()) {
      rowIndex = i + 1; // 1-based index
      break;
    }
    // Fallback: Check Name match if EmpID not found/provided
    if (!rowIndex && data[i][2] == form.originalName) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex > 0) {
    // Update Columns
    // 0: Timestamp (skip), 1: EmpID, 2: Name, 3: Nickname, 4: ManagerName, 5: Position, 6: Email, 7: Phone, 8: Zone, 9: Info, 10: Edu, 11: Intro
    
    // We update row at 'rowIndex'
    // Note: getRange(row, col).setValue(val)
    
    sheet.getRange(rowIndex, 2).setValue(form.empId);        // Col 2: EmpID
    sheet.getRange(rowIndex, 3).setValue(form.name);         // Col 3: Name
    sheet.getRange(rowIndex, 4).setValue(form.nickname);     // Col 4: Nickname
    sheet.getRange(rowIndex, 5).setValue(form.manager);      // Col 5: Manager
    sheet.getRange(rowIndex, 6).setValue(form.position);     // Col 6: Position
    sheet.getRange(rowIndex, 7).setValue(form.email);        // Col 7: Email
    sheet.getRange(rowIndex, 8).setValue(form.phone);        // Col 8: Phone
    sheet.getRange(rowIndex, 9).setValue(form.zone);         // Col 9: Zone
    sheet.getRange(rowIndex, 10).setValue(form.info);        // Col 10: Info
    sheet.getRange(rowIndex, 12).setValue(form.intro);       // Col 12: Intro
    sheet.getRange(rowIndex, 14).setValue(form.department);  // Col 14: Department
    
    // Handle Photo Update
    if (form.photoData && form.photoMimeType && form.photoName) {
      try {
        var folderName = "Employee_Profiles_Images";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = DriveApp.createFolder(folderName);
        }
        
        var filename = form.empId + "_" + form.photoName;
        var blob = Utilities.newBlob(Utilities.base64Decode(form.photoData), form.photoMimeType, filename);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var newFileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
        
        // Update Photo URL Column (Col 13)
        sheet.getRange(rowIndex, 13).setValue(newFileUrl);
      } catch (e) {
        // Log error but continue
        Logger.log("Error updating photo: " + e.toString());
      }
    }
    
    return { success: true };
  } else {
    return { success: false, error: "Employee not found" };
  }
}

function processForm(formObject) {
  try {
    var _wlock = _acquireWriteLock_();
    // 0. Check for duplicate email
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    if (sheet.getLastRow() > 0) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var emailColIndex = -1;
      
      // Find Email column
      for (var i = 0; i < headers.length; i++) {
        if (headers[i].toString().trim().toLowerCase() === "email") {
          emailColIndex = i;
          break;
        }
      }
      
      // Check if email already exists
      if (emailColIndex > -1 && formObject.email) {
        var allData = sheet.getDataRange().getValues();
        var submittedEmail = formObject.email.toString().toLowerCase().trim();
        
        for (var row = 1; row < allData.length; row++) {
          var existingEmail = allData[row][emailColIndex];
          if (existingEmail && existingEmail.toString().toLowerCase().trim() === submittedEmail) {
            return { success: false, error: "This email is already registered. Please use a different email or contact admin." };
          }
        }
      }
    }
    
    // 1. Save File to Drive
    var fileUrl = "";
    if (formObject.photoData && formObject.photoMimeType && formObject.photoName) {
      var folderName = "Employee_Profiles_Images";
      var folder;
      var folders = DriveApp.getFoldersByName(folderName);
      
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
      
      // Decode the base64 data
      var blob = Utilities.newBlob(Utilities.base64Decode(formObject.photoData), formObject.photoMimeType, formObject.photoName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // Create a thumbnail link which is better for embedding
      fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
    }

    // 2. Save Data to Spreadsheet
    
    // Check if headers exist, if not create them
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
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
        "Photo URL",
        "Department",
        "Password"
      ]);
    }

    var hashedPassword = "";
    if (formObject.password) {
        hashedPassword = hashPassword(formObject.password);
    } else {
        hashedPassword = hashPassword("1234"); 
    }

    // --- Dynamic Column Mapping ---
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowData = new Array(headers.length).fill(""); // Initialize with empty strings

    // Map fields to specific headers
    var fieldMap = {
        "Timestamp": new Date(),
        "Employee ID": formObject.empId,
        "Full Name": formObject.name,
        "Nickname": formObject.nickname,
        "Direct Manager": formObject.manager,
        "Position": formObject.position,
        "Email": formObject.email,
        "Phone": "'" + formObject.phone, // Prefix with ' to keep leading zeros in Google Sheets
        "Zone": formObject.zone,
        "Personal Info": formObject.personalInfo,
        "Education": formObject.education,
        "Self Introduction": formObject.intro,
        "Photo URL": fileUrl,
        "Department": formObject.department,
        "Password": hashedPassword
    };

    // Fill rowData based on header name
    for (var i = 0; i < headers.length; i++) {
        var headerName = headers[i].toString().trim();
        if (fieldMap.hasOwnProperty(headerName)) {
            rowData[i] = fieldMap[headerName];
        }
    }

    // Handle missing columns if any (append to end if not found in current headers? 
    // For now, let's assume if they added a column like "User Type" it's effectively read-only/default for new rows)
    // Actually, "User Type" probably needs a default? Or leave empty. 
    // But importantly, we must ensure critical fields (like Password) aren't lost if the header is named slightly differently?
    // The user said "Password" is in a specific column. We trust the header name is "Password".
    
    // Check if "Password" was found. If not, maybe append it? 
    // But existing sheet has it. So it should be fine.

    sheet.appendRow(rowData);

    return { success: true };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getEmployeeExtendedData(empId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    performance: [],
    talent: {},
    assignments: []
  };
  
  if (!empId) return result;
  
  // Helper to extract data matching EmpID (Column 0)
  function getData(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    data.shift(); // Remove headers
    return data.filter(function(row) {
      return String(row[0]) == String(empId);
    });
  }

  // 1. Performance
  var perfData = getData("Performance_Review");
  result.performance = perfData.map(function(row) {
    return {
      year: row[1],
      period: row[2],
      grade: row[3],
      score: row[4],
      reviewer: row[5],
      comments: row[6]
    };
  });

  // 2. Talent (Assuming 1 entry per employee, take the last one if multiple)
  var talentData = getData("Talent_Data");
  if (talentData.length > 0) {
    var row = talentData[talentData.length - 1]; // Latest entry
    result.talent = {
      perfRating: row[1],
      potRating: row[2],
      readiness: row[3],
      strengths: row[4],
      needs: row[5]
    };
  }

  // 3. Assignments
  var assignData = getData("Assignments");
  result.assignments = assignData.map(function(row) {
    return {
      project: row[1],
      role: row[2],
      status: row[3],
      start: row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), "dd/MM/yyyy") : "",
      end: row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), "dd/MM/yyyy") : "",
      achievements: row[6]
    };
  });

  return result;
}

// --- New Feature Handlers ---

function getEmployeeListV2(targetEmail) {
  try {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Employee_Database");
  if (!sheet) {
      sheet = ss.getSheets()[0]; // Fallback to first sheet
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Empty or just header
  
  data.shift(); // Remove header
  
  // Return list of {id, name}
  // Check Admin Status
  var userEmail = targetEmail || Session.getActiveUser().getEmail();
  Logger.log("=== getEmployeeList Debug ===");
  Logger.log("User Email: " + userEmail);
  
  var check = checkAdminStatus(userEmail);
  var isAdmin = check.isAdmin;
  
  Logger.log("Is Admin: " + isAdmin);
  Logger.log("Admin Check Logs: " + JSON.stringify(check.logs));

  // 1. Find the Employee ID of the current user
  var currentUserEmpId = "";
  var emailIdx = 6; // Default Email Column
  var empIdIdx = 1; // Default EmpID Column
  
  // Dynamic Header Check
  var headers = data[0];
  for (var h=0; h<headers.length; h++) {
      var header = String(headers[h]).trim().toLowerCase();
      if (header === "email") emailIdx = h;
      if (header === "employee id" || header === "empid" || header === "id") empIdIdx = h;
  }
  
  for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[emailIdx] && String(row[emailIdx]).trim().toLowerCase() === String(userEmail).trim().toLowerCase()) {
            currentUserEmpId = String(row[empIdIdx]).trim();
            Logger.log("Found Current User EmpID: " + currentUserEmpId);
            break;
        }
  }

  // 2. Filter List
  var result = data.map(function(row) {
    var id = row[1];
    var name = row[2];
    var nickname = row[3];
    var position = row[5];
    var email = row[6]; // Email
    var zone = row[8];
    var department = row[13]; // New Department Column
    
    // Filter out rows if not admin and not the user (Check by ID now)
    if (!isAdmin) {
        // If we found the user's ID, match by ID. 
        // If not found (currentUserEmpId is empty), fallback to email match or return nothing.
        
        var isMatch = false;
        if (currentUserEmpId) {
             if (String(id).trim() === currentUserEmpId) isMatch = true;
        } else {
             // Fallback: Email Match
             if (email && String(email).trim().toLowerCase() === String(userEmail).trim().toLowerCase()) isMatch = true;
        }
        
        if (!isMatch) {
            return null;
        } else {
            Logger.log("Non-admin user matched: " + name + " (" + email + ")");
        }
    } else {
        // Admin sees all
    }

    if (id && name) {
        // Format: [Nickname] Name [Department] [Position] [Zone]
        var displayName = "";
        
        
        if (nickname) displayName += "[" + nickname + "] ";
        displayName += name;
        if (department) displayName += " [" + department + "]"; 
        if (position) displayName += " [" + position + "]";
        if (zone) displayName += " [" + zone + "]";

        return {
          id: id, 
          name: displayName
        };
    }
    return result;
  }).filter(function(item) {
     return item != null;
  });
  
  // Final Safety Check: If empty, return specific debug item
  if (result.length === 0) {
       return [{id: "", name: "⚠️ No Match found for: " + userEmail + (isAdmin ? " (Admin)" : "")}];
  }
  
  return result;

  } catch (e) {
      Logger.log("Error in getEmployeeListV2: " + e.toString());
      return [{id: "", name: "Error: " + e.toString()}];
  }
}


// --- ADMIN CHECK ---
// --- ADMIN CHECK ---
function checkAdminStatus(clientEmail) {
    // 1. Determine Effective Email
    // If clientEmail is provided (from frontend after login), trust it (or validate token if we had one).
    // Otherwise, callback to Session (e.g. direct run).
    var effectiveEmail = clientEmail ? String(clientEmail).trim().toLowerCase() : String(Session.getActiveUser().getEmail()).trim().toLowerCase();
    
    var isAdmin = false;
    var isSMF = false;
    var isMMS = false;
    var isScheduleAdmin = false;
    var logs = [];
    
    logs.push("Auth Check Start");
    logs.push("Input Email: " + (clientEmail || "null"));
    logs.push("Session Email: " + Session.getActiveUser().getEmail());
    logs.push("Effective Email: " + effectiveEmail);

    // 2. Hardcoded Safety Net (Optional, but good for testing)
    // const GOD_MODE_EMAILS = ["barramee.mah@bigc.co.th"];
    // if (GOD_MODE_EMAILS.includes(effectiveEmail)) return { isAdmin: true, email: effectiveEmail, logs: logs };

    try {
        var sheet = findEmployeeSheet();
        if (!sheet) {
            logs.push("CRITICAL: Employee Sheet not found!");
            return { isAdmin: false, email: effectiveEmail, logs: logs, error: "DB Missing" };
        }
        
        var data = sheet.getDataRange().getValues();
        logs.push("DB Rows: " + data.length);
        
        if (data.length === 0) {
             logs.push("DB is empty");
             return { isAdmin: false, logs: logs };
        }

        // 3. Dynamic Column Finding
        var headers = data[0]; 
        var emailIdx = -1;
        var userTypeIdx = -1;
        var noteIdx = -1;
        
        for (var h = 0; h < headers.length; h++) {
            var header = String(headers[h]).trim().toLowerCase();
            if (header === "email") {
                emailIdx = h;
            } else if (['user type', 'role', 'usertype', 'access level', 'admin', 'permission'].includes(header)) {
                userTypeIdx = h;
            } else if (header === "note" || header === "notes") {
                noteIdx = h;
            }
        }
        
        logs.push(`Cols Found -> Email: ${emailIdx}, Role: ${userTypeIdx}`);
        
        if (emailIdx === -1) {
             logs.push("CRITICAL: Email column not found in DB");
             return { isAdmin: false, logs: logs };
        }

        if (userTypeIdx === -1) {
             logs.push("CRITICAL: 'Role' or 'User Type' column not found in DB. Please add a column named 'Role' or 'User Type'.");
             // return { isAdmin: false, logs: logs }; // Fail early if strict
        }
        
        // 4. Scan Rows
        var matchFound = false;
        for (var i = 1; i < data.length; i++) {
            var rowEmail = String(data[i][emailIdx]).trim().toLowerCase();
            
            if (rowEmail === effectiveEmail) {
                matchFound = true;
                logs.push(`Match Row ${i+1}: ${rowEmail}`);
                
                if (userTypeIdx > -1) {
                    var role = String(data[i][userTypeIdx]).trim().toLowerCase();
                    logs.push(`Role in DB: '${role}'`);
                    
                    // Check SMF/MMS team via Note column FIRST (before any break)
                    if (noteIdx > -1) {
                        var teamNote = String(data[i][noteIdx]).trim().toUpperCase();
                        if (!isSMF && teamNote === 'SMF') {
                            isSMF = true;
                            logs.push("SMF team member identified.");
                        }
                        if (!isMMS && teamNote === 'MMS') {
                            isMMS = true;
                            logs.push("MMS team member identified.");
                        }
                    }

                    if (role === 'admin') {
                        isAdmin = true;
                        logs.push("SUCCESS: Admin privs granted.");
                        break; // Stop scanning only if we found an Admin entry
                    } else if (['survey_admin', 'schedule_admin', 'surveyAdmin', 'scheduleAdmin'].indexOf(role) !== -1) {
                        isScheduleAdmin = true;
                        logs.push("SUCCESS: Schedule/Survey Admin privs granted.");
                    } else {
                        logs.push("User exists but role is not admin. Checking next row...");
                    }
                } else {
                    logs.push("WARN: User found but no Role/User Type column in DB.");
                    // Still check Note column even if no role column exists
                    if (noteIdx > -1) {
                        var teamNote = String(data[i][noteIdx]).trim().toUpperCase();
                        if (!isSMF && teamNote === 'SMF') { isSMF = true; }
                        if (!isMMS && teamNote === 'MMS') { isMMS = true; }
                    }
                }
                // Do NOT break here; continue searching in case there's another entry for this email with Admin role.
            }
        }
        
        if (!matchFound) logs.push("FAIL: Email not found in DB.");
        
    } catch (e) {
        logs.push("EXCEPTION: " + e.toString());
        console.error("Admin Check Error", e);
    }

    console.log("Admin Check Result:", { isAdmin: isAdmin, isSMF: isSMF, isMMS: isMMS, isScheduleAdmin: isScheduleAdmin, email: effectiveEmail, logs: logs });
    return { isAdmin: isAdmin, isSMF: isSMF, isMMS: isMMS, isScheduleAdmin: isScheduleAdmin, email: effectiveEmail, logs: logs };
}

// Deprecated: checkAdminStatusById - Use checkAdminStatus(email) instead
function checkAdminStatusById(id) { return { isAdmin: false, logs: ["Deprecated function"] }; }

function processPerformanceForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        // Check Admin by Email (Same as Tab Visibility)
        var status = checkAdminStatus(form.adminEmail);
        if (!status.isAdmin) {
             // Return FULL debug logs for user to share
             var logs = status.logs ? status.logs.join("\\n") : "No logs";
             return { success: false, error: "Access Denied (v3 TEST): Admins only. (Checked Email: " + form.adminEmail + ")\\n" + logs };
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Performance_Review");
        sheet.appendRow([
            form.empId,
            form.year,
            form.period,
            form.grade,
            form.score,
            form.reviewer,
            form.comments
        ]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function processTalentForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var status = checkAdminStatus(form.adminEmail);
        if (!status.isAdmin) {
             // Return FULL debug logs for user to share
             var logs = status.logs ? status.logs.join("\\n") : "No logs";
             return { success: false, error: "Access Denied (v3 TEST): Admins only. (Checked Email: " + form.adminEmail + ")\\n" + logs };
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Talent_Data");
        sheet.appendRow([
            form.empId,
            form.perfRating,
            form.potRating,
            form.readiness,
            form.strengths,
            form.needs
        ]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function processAssignmentForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assignments");
        sheet.appendRow([
            form.empId,
            form.project,
            form.role,
            form.status,
            form.start,
            form.end,
            form.achievements,
            form.department // New Department
        ]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getAssignmentReport() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var assignmentSheet = ss.getSheetByName("Assignments");
        var employeeSheet = ss.getSheetByName("Employee_Database");
        
        if (!assignmentSheet) {
            return { error: "Assignments sheet not found" };
        }
        
        var assignmentData = assignmentSheet.getDataRange().getValues();
        if (assignmentData.length <= 1) {
            return { assignments: [] }; // Empty or just header
        }
        
        // Build employee lookup map
        var empMap = {};
        if (employeeSheet) {
            var empData = employeeSheet.getDataRange().getValues();
            for (var i = 1; i < empData.length; i++) {
                var empId = empData[i][1]; // Column B (index 1)
                var empName = empData[i][2]; // Column C (index 2)
                if (empId && empName) {
                    empMap[empId] = empName;
                }
            }
        }
        
        // Process assignments
        var assignments = [];
        for (var i = 1; i < assignmentData.length; i++) {
            var row = assignmentData[i];
            var empId = row[0];
            var empName = empMap[empId] || empId;
            
            assignments.push({
                empId: empId,
                empName: empName,
                project: row[1] || '',
                role: row[2] || '',
                status: row[3] || '',
                start: row[4] || '',
                end: row[5] || '',
                achievements: row[6] || '',
                department: row[7] || ''
            });
        }
        
        return { assignments: assignments };
    } catch (e) {
        return { error: e.toString() };
    }
}


// --- Work Order Feature ---

// const ADMIN_EMAIL = 'barramee.mahayossanunt@gmail.com'; // Already defined in Setup.gs

function processWorkOrderForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        var headers = ["Timestamp", "ID", "Employee ID", "Project/Task", "Details", "Priority", "Deadline", "Status", "Approved By", "Approval Date", "Evidence URL", "Rating", "Creation Attachment", "Start Date", "Store", "Classification", "Confidential"];
        
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Work_Orders");
            sheet.appendRow(headers);
        } else {
             ensureWorkOrderHeaders(sheet);
        }

        var id = "WO-" + new Date().getTime(); 
        var attachmentUrls = [];
        
        // --- DEBUG LOGGING ---
        Logger.log("processWorkOrderForm Called");
        Logger.log("Form Data: " + JSON.stringify(form));
        Logger.log("Station: " + form.station);
        Logger.log("Classification: " + form.classification);
        Logger.log("Confidential: " + form.confidential);
        // ---------------------

// ... (Existing code) ...

        // Handle Creation Attachments (Multiple)
        // Store Blobs for Email
        var emailAttachments = [];

        if (form.attachmentList && form.attachmentList.length > 0) {
            var folderName = "Work_Orders_Attachments";
            var folder;
            var folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(folderName); }
            
            form.attachmentList.forEach(function(att) {
                if(att.data && att.name) {
                    var filename = id + "_" + att.name;
                    var blob = Utilities.newBlob(Utilities.base64Decode(att.data), att.mimeType, filename);
                    var file = folder.createFile(blob);
                    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    attachmentUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    emailAttachments.push(blob); // Add to email
                }
            });
        }
        else if (form.attachmentData && form.attachmentName) {
             var folderName = "Work_Orders_Attachments";
             var folder;
             var folders = DriveApp.getFoldersByName(folderName);
             if (folders.hasNext()) { folder = folders.next(); }
             else { folder = DriveApp.createFolder(folderName); }
             
             var filename = id + "_" + form.attachmentName;
             var blob = Utilities.newBlob(Utilities.base64Decode(form.attachmentData), form.attachmentMimeType, filename);
             var file = folder.createFile(blob);
             file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
             attachmentUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
             emailAttachments.push(blob); // Add to email
        }
        
        Logger.log("Processing Work Order. Send Email Flag: " + form.sendEmail + " (Type: " + typeof form.sendEmail + ")");

        sheet.appendRow([
            new Date(),
            id,
            form.empId,
            form.project,
            form.details,
            form.priority,
            form.deadline,
            "Pending",
            "", // Approved By
            "",  // Approval Date
            "", // Evidence URL
            "",  // Rating
            attachmentUrls.join("\n"), // Creation Attachment (Joined by Newline)
            form.startDate ? Utilities.formatDate(new Date(form.startDate), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
            form.station || "",
            form.classification || "",
            form.confidential === true || form.confidential === "true" // Confidential
        ]);

        // --- Email Notification Logic ---
        var emailSent = false;
        var emailLog = "";
        try {
            var toEmail = "";
            var ccEmails = [];
            
            // 1. Assignee Email (N)
            var assigneeEmail = getEmployeeEmail(form.empId);
            toEmail = assigneeEmail;
            
            // 2. Manager Emails (N+1, N+2)
            var managerEmail = getManagerEmailForEmployee(form.empId);
            if (managerEmail) ccEmails.push(managerEmail);
            
            var managersManagerEmail = getManagersManagerEmail(form.empId);
            if (managersManagerEmail) ccEmails.push(managersManagerEmail);

            // --- Lookup Employee Name & Dept for Report ---
            var empName = form.empId;
            var empDept = "";
            try {
                var empSheet = findEmployeeSheet();
                if (empSheet) {
                    var empData = empSheet.getDataRange().getValues();
                    // Assuming Col 1 = ID, Col 2 = Name, Col 13 = Dept
                    for(var j=1; j<empData.length; j++) {
                        // Robust ID check
                        if(String(empData[j][1]).trim() === String(form.empId).trim()) {
                            empName = empData[j][2];
                            empDept = empData[j][13];
                            break;
                        }
                    }
                }
            } catch(err) {
                Logger.log("Emp Lookup Error: " + err);
            }

            if (form.sendEmail === false || form.sendEmail === "false") {
                emailSent = true; // Use true to suppress frontend error alert
                emailLog = "Email disabled by user.";
            } else if (toEmail) {
                var subject = "New Work Order: " + form.project + " (Pending)";
                
                // --- HTML Email Body ---
                var htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                    <h2 style="color: #1a73e8; margin-top: 0; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Work Order Request</h2>
                    
                    <p style="color: #555;">A new Work Order has been assigned.</p>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; width: 30%;">Project / Task</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${form.project}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Work Order ID</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${id}</td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Requestor / Assignee</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <strong>${empName}</strong><br>
                                <span style="font-size: 12px; color: #777;">ID: ${form.empId} | Dept: ${empDept || '-'}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Priority</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <span style="padding: 4px 8px; border-radius: 4px; font-weight: bold; ${form.priority === 'High' ? 'background-color: #fee; color: #c00;' : form.priority === 'Medium' ? 'background-color: #ffeaa7; color: #d63031;' : 'background-color: #dfe6e9; color: #2d3436;'}">${form.priority}</span>
                            </td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Schedule</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <div>Start: ${form.startDate ? Utilities.formatDate(new Date(form.startDate), Session.getScriptTimeZone(), "dd MMM yyyy") : "-"}</div>
                                <div>Deadline: ${Utilities.formatDate(new Date(form.deadline), Session.getScriptTimeZone(), "dd MMM yyyy")}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; vertical-align: top;">Details</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <div style="white-space: pre-wrap;">${form.details || '-'}</div>
                            </td>
                        </tr>
                         ${attachmentUrls.length > 0 ? `
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; vertical-align: top;">Links</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                ${attachmentUrls.map(url => `<a href="${url}" target="_blank" style="color: #1a73e8; text-decoration: none;">📎 View Google Drive File</a>`).join('<br>')}
                            </td>
                        </tr>
                        ` : ''}
                    </table>

                    <div style="margin-top: 25px; text-align: center;">
                        <a href="${ScriptApp.getService().getUrl()}?page=work-order-report" 
                           style="background-color: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           View Dashboard
                        </a>
                    </div>
                </div>
                `;
                
                // Remove duplicates from CC
                var uniqueCC = [...new Set(ccEmails)];
                var emailOptions = {
                    to: toEmail,
                    subject: subject,
                    htmlBody: htmlBody
                };
                
                if (uniqueCC.length > 0) {
                    emailOptions.cc = uniqueCC.join(",");
                }

                // Add attachments
                if (emailAttachments.length > 0) {
                    emailOptions.attachments = emailAttachments;
                }

                MailApp.sendEmail(emailOptions);
                console.log("Work Order Email sent to: " + toEmail + (uniqueCC.length > 0 ? ", CC: " + uniqueCC.join(", ") : ""));
                emailSent = true;
                emailLog = "Sent to assignee" + (uniqueCC.length > 0 ? " + " + uniqueCC.length + " CC" : "");
            } else {
                console.warn("WARNING: No assignee email found for Work Order " + id + ". Check Employee DB for ID: " + form.empId);
                emailLog = "No assignee email found.";
                // Do not set emailSent = true here, so frontend warns user
            }
        } catch (mailErr) {
            console.error("Work Order Email Error: " + mailErr.toString());
            emailLog = "Error: " + mailErr.toString();
        }

        return { success: true, emailSent: emailSent, emailLog: emailLog, debugData: form };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Helper to get Station List (Placeholder - User to update)
// Helper to get Station List from "Stores" Sheet
// Helper to get Station List from "Store Data" Sheet
// Helper to get Station List from "Store Data" Sheet (External)
// Helper to get Station List (Uses shared logic from TripPlan.gs)
function getStationList() {
    try {
        var data = getStoreDBDataV2(); // Call shared function
        if (!data || data.length === 0) return [];
        
        // Map to simple string array "ID Name"
        return data.map(function(s) {
            return s.station; 
        });
    } catch (e) {
        console.error("Error getting station list associated with TripPlan: " + e.toString());
        return [];
    }
}

// getStoreDBData removed - using shared getStoreDBDataForFrontend in TripPlan.gs

// Helper to find Manager's Email from Employee Sheet
function getManagerEmailForEmployee(empId) {
    try {
        var sheet = findEmployeeSheet();
        
        var data = sheet.getDataRange().getValues();
        
        // 1. Find the Employee's Manager Name
        var managerName = "";
        for (var i = 1; i < data.length; i++) {
            // Trim and string conversion for robust ID match
            if (String(data[i][1]).trim() === String(empId).trim()) { // Col 1 is EmpID
                managerName = data[i][4]; // Col 4 is Manager Name
                break;
            }
        }
        
        if (!managerName) return null;
        
        // 2. Find Manager's Email by Name
        for (var i = 1; i < data.length; i++) {
            // Trim and case-insensitive check for Name match
            if (String(data[i][2]).trim().toLowerCase() === String(managerName).trim().toLowerCase()) { // Col 2 is Name
                 return data[i][6]; // Col 6 is Email
            }
        }
        
        return null; // Not found
    } catch (e) {
        console.warn("getManagerEmailForEmployee Error: " + e.toString());
        return null; // Return null instead of crashing, but log it
    }
}

// Helper to get n+2 manager (manager's manager) email for an employee
function getManagersManagerEmail(empId) {
    try {
        var sheet = findEmployeeSheet();
        if (!sheet) return null;
        
        var data = sheet.getDataRange().getValues();
        
        // First, find the employee's direct manager (n+1)
        var directManagerName = null;
        for (var i = 1; i < data.length; i++) {
             // Robust ID match
            if (String(data[i][1]).trim() === String(empId).trim()) { // Col 1 is Employee ID
                directManagerName = data[i][4]; // Col 4 is Direct Manager
                break;
            }
        }
        
        if (!directManagerName) return null;
        
        // Now find the direct manager's manager (n+2)
        for (var i = 1; i < data.length; i++) {
            // Robust Name match
            if (data[i][2] && String(data[i][2]).trim().toLowerCase() === String(directManagerName).trim().toLowerCase()) { // Col 2 is Full Name
                var managersManagerName = data[i][4]; // This manager's Direct Manager
                if (!managersManagerName) return null;
                
                // Find the email of n+2
                for (var j = 1; j < data.length; j++) {
                     // Robust Name match
                    if (data[j][2] && String(data[j][2]).trim().toLowerCase() === String(managersManagerName).trim().toLowerCase()) {
                        return data[j][6]; // Col 6 is Email
                    }
                }
            }
        }
        
        return null;
    } catch (e) {
        console.error("Error getting manager's manager: " + e.toString());
        return null;
    }
}

function getEmployeeEmail(empId) {
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        
        for (var i = 1; i < data.length; i++) {
             // Robust ID match
            if (String(data[i][1]).trim() === String(empId).trim()) { // Col 1 is EmpID
                 return data[i][6]; // Col 6 is Email
            }
        }
        return null;
    } catch (e) {
        console.warn("getEmployeeEmail Error: " + e.toString());
        return null;
    }
}

// Helper to include HTML files
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

// Helper to hash passwords (SHA-256)
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var txtHash = '';
  for (var i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];
    if (hashVal < 0) {
      hashVal += 256;
    }
    if (hashVal.toString(16).length == 1) {
      txtHash += '0';
    }
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function loginUser(emailOrId, password) {
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // 1. Check for Password Column
        var pwdColIndex = headers.indexOf("Password");
        if (pwdColIndex === -1) {
            // Create Password Column if missing
            pwdColIndex = headers.length;
            sheet.getRange(1, pwdColIndex + 1).setValue("Password");
            sheet.getRange(1, pwdColIndex + 1).setFontWeight("bold");
            sheet.getRange(1, pwdColIndex + 1).setBackground("#e6b8af"); // Light Red
            
            // Set default "1234" for all existing rows
            if (data.length > 1) {
                sheet.getRange(2, pwdColIndex + 1, data.length - 1, 1).setValue("1234");
            }
            // Reload data
            data = sheet.getDataRange().getValues();
        }
        
        // 2. Find User (by Email OR Employee ID)
        var userRow = null;
        var rowIndex = -1;
        var input = String(emailOrId).trim().toLowerCase();
        
        // Find indices
        var emailColIndex = headers.indexOf("Email"); 
        if(emailColIndex === -1) emailColIndex = 6; // Fallback
        
        var empIdColIndex = headers.indexOf("Employee ID");
        if(empIdColIndex === -1) empIdColIndex = 1; // Fallback
        
        for (var i = 1; i < data.length; i++) {
            var rowEmail = String(data[i][emailColIndex]).trim().toLowerCase();
            var rowId = String(data[i][empIdColIndex]).trim().toLowerCase();
            
            if (rowEmail === input || rowId === input) {
                userRow = data[i];
                rowIndex = i; // 0-indexed in array, so Row is i+1 in Sheet
                break;
            }
        }
        
        if (!userRow) {
             return { success: false, error: "User not found (Check Email or Employee ID)." };
        }
        
        // 3. Check Password (Hash or Legacy)
        var storedPwd = String(userRow[pwdColIndex]);
        var inputHash = hashPassword(password);
        
        var isMatch = false;
        var needsMigration = false;
        
        if (storedPwd === inputHash) {
            isMatch = true;
        } else if (storedPwd === String(password)) {
            // Legacy Plain Text Match
            isMatch = true;
            needsMigration = true;
        }
        
        if (isMatch) {
             // Migrate if needed
             if (needsMigration) {
                 sheet.getRange(rowIndex + 1, pwdColIndex + 1).setValue(inputHash);
             }
             
             // Check Admin Status
             var adminCheck = checkAdminStatus(userRow[emailColIndex]);

             // LOG ACTIVITY
             try {
                logUserActivity(userRow[emailColIndex], "Login", "Success");
             } catch(e) {
                console.error("Login Log Error", e);
             }
             
             // Success - RETURN THE REAL EMAIL
             return { 
                 success: true, 
                 user: {
                     email: userRow[emailColIndex], // Always return the DB email
                     name: userRow[2], // Name
                     empId: userRow[1], // ID
                     role: 'User', // Basic role for now
                     isAdmin: adminCheck.isAdmin, // Admin flag
                     isSMF: adminCheck.isSMF || false, // SMF team flag
                     isScheduleAdmin: adminCheck.isScheduleAdmin || false // Schedule/Survey Admin flag
                 }
             };
        } else {
             return { success: false, error: "Invalid Password" };
        }
        
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function changePassword(email, oldPassword, newPassword) {
  try {
    var _wlock = _acquireWriteLock_();
    var loginResult = loginUser(email, oldPassword);
    if (!loginResult.success) {
      return { success: false, error: "Old password incorrect." };
    }
    
    // If login successful, we verify the user is valid. Now update password.
    var sheet = findEmployeeSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    var emailColIndex = headers.indexOf("Email");
    if(emailColIndex === -1) emailColIndex = 6; 
    
    var pwdColIndex = headers.indexOf("Password");
    // Should exist if loginUser worked
    
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][emailColIndex]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
            // Found User
            var newHash = hashPassword(newPassword);
            sheet.getRange(i + 1, pwdColIndex + 1).setValue(newHash);
            return { success: true };
        }
    }
    return { success: false, error: "User not found during update." };
    
  } catch(e) {
     return { success: false, error: e.toString() };
  }
}


