// --- Trip Plan Feature ---

// Global cache for store database (valid for 6 hours)
var STORE_CACHE_KEY = 'STORE_DB_CACHE_V6';
var CACHE_DURATION = 1800; // 30 minutes in seconds

// Helper to check if user is n+2 of an employee in SMF team
function isN2OfSMFTeamMember(userEmail, requesterId) {
    try {
        console.log("=== isN2OfSMFTeamMember Debug ===");
        console.log("User Email:", userEmail);
        console.log("Requester ID:", requesterId);
        
        if (!userEmail || !requesterId) {
            console.log("Missing userEmail or requesterId");
            return false;
        }
        
        var empSheet = findEmployeeSheet();
        if (!empSheet) {
            console.log("Employee sheet not found");
            return false;
        }
        
        var data = empSheet.getDataRange().getValues();
        var headers = data[0];
        
        // Log headers to verify column structure
        // console.log("Headers:", headers);
        
        // Find column indices
        var empIdIdx = -1, noteIdx = -1, emailIdx = -1, managerIdx = -1, nameIdx = -1;
        for (var h = 0; h < headers.length; h++) {
            var headerName = String(headers[h]).trim().toLowerCase();
            if (headerName === "employee id") empIdIdx = h;
            if (headerName === "note" || headerName === "notes") noteIdx = h;
            if (headerName === "email") emailIdx = h;
            if (headerName === "direct manager") managerIdx = h;
            if (headerName === "full name") nameIdx = h;
        }
        
        console.log("Column Indices - EmpID:", empIdIdx, "Note:", noteIdx, "Email:", emailIdx, "Manager:", managerIdx, "Name:", nameIdx);
        
        if (empIdIdx === -1 || emailIdx === -1 || managerIdx === -1 || nameIdx === -1) {
            console.log("Required columns (ID, Email, Manager, Name) not found");
            return false;
        }
        
        // Find requester's row
        var requesterNote = null;
        var requesterManagerName = null;
        var requesterRowData = null;
        
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][empIdIdx]).trim() === String(requesterId).trim()) {
                if (noteIdx > -1) requesterNote = data[i][noteIdx];
                requesterManagerName = data[i][managerIdx];
                requesterRowData = data[i];
                console.log("Found requester - Note:", requesterNote, "Manager:", requesterManagerName);
                break;
            }
        }
        
        if (!requesterRowData) {
             console.log("Requester ID not found:", requesterId);
             return false;
        }
        
        // Check if requester is in SMF team (Check Note Column OR Scan Row)
        var isSMF = false;
        if (requesterNote && String(requesterNote).trim().toUpperCase() === "SMF") {
            isSMF = true;
        } else {
            // Fallback: Scan row for "SMF"
            for (var c = 0; c < requesterRowData.length; c++) {
                if (String(requesterRowData[c]).trim().toUpperCase() === "SMF") {
                    isSMF = true;
                    // console.log("Found SMF tag in Col " + c);
                    break;
                }
            }
        }

        if (!isSMF) {
            console.log("Requester is not in SMF team");
            return false;
        }
        
        console.log("Requester is in SMF team");
        
        // Get n+1 (direct manager) email
        var n1Email = null;
        var n1ManagerName = null;
        
        if (requesterManagerName) {
            for (var i = 1; i < data.length; i++) {
                // Case-Insensitive Name Match
                if (String(data[i][nameIdx]).trim().toLowerCase() === String(requesterManagerName).trim().toLowerCase()) {
                    n1Email = data[i][emailIdx];
                    n1ManagerName = data[i][managerIdx]; // This manager's manager
                    console.log("Found n+1 manager - Email:", n1Email, "Their Manager:", n1ManagerName);
                    
                    // Get n+2 (manager's manager) email
                    if (n1ManagerName) {
                        for (var j = 1; j < data.length; j++) {
                             // Case-Insensitive Name Match
                            if (String(data[j][nameIdx]).trim().toLowerCase() === String(n1ManagerName).trim().toLowerCase()) {
                                var n2Email = data[j][emailIdx];
                                console.log("Found n+2 manager - Email:", n2Email);
                                
                                if (n2Email && userEmail && String(n2Email).trim().toLowerCase() === String(userEmail).trim().toLowerCase()) {
                                    console.log("✓ User IS the n+2 manager of SMF team member");
                                    return true;
                                }
                                break;
                            }
                        }
                    } else {
                        console.log("n+1 manager has no manager (no n+2)");
                    }
                    break;
                }
            }
        }
        
        console.log("✗ User is NOT the n+2 manager of SMF team member");
        return false;
    } catch (e) {
        console.error("Error checking n+2 SMF status: " + e.toString());
        return false;
    }
}

// Preload and cache store database
function loadStoreDatabase() {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(STORE_CACHE_KEY);
    
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch(e) {
            console.log("Cache parse error, reloading...");
        }
    }
    
    // Load from external spreadsheet
    var storeData = {
        provinceMap: {},
        gpsMap: {},
        nameMap: {},
        addressMap: {}
    };
    
    try {
        var storeSheet = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit").getSheets()[0];
        if (storeSheet) {
            var data = storeSheet.getDataRange().getValues();
            
            // Dynamic Header Row Detection (Scan first 5 rows)
            var headerRowIndex = 0;
            var latIdx = -1, longIdx = -1, nameIdx = -1, idIdx = -1, provIdx = -1, addrIdx = -1;
            
            for (var r = 0; r < Math.min(data.length, 5); r++) {
                var row = data[r];
                var foundLat = false;
                var foundName = false;
                
                for (var c = 0; c < row.length; c++) {
                    var val = String(row[c]).trim().toLowerCase();
                    if (val.includes("latitude") || val === "lat") foundLat = true;
                    if (val.includes("store name") || val.includes("site name")) foundName = true;
                }
                
                if (foundLat && foundName) {
                    headerRowIndex = r;
                    break;
                }
            }
            
            var h = data[headerRowIndex];
            console.log("Header Found at Row: " + headerRowIndex);
            
            for(var k=0; k<h.length; k++) {
                var hh = String(h[k]).trim().toLowerCase();
                if(hh.includes("province")) provIdx = k;
                if(hh.includes("store name(th)")) nameIdx = k;
                if(hh.includes("store name") && nameIdx === -1) nameIdx = k;
                if(hh.includes("site name") && nameIdx === -1) nameIdx = k;
                if(hh.includes("gold code") || hh.includes("gold text") || hh.includes("store id") || hh.includes("site id")) idIdx = k;
                if(hh.includes("address")) addrIdx = k;
                if(hh === "latitude" || hh.includes("lat")) latIdx = k;
                if(hh === "longitude" || hh.includes("long")) longIdx = k;
            }
            
            for(var r=headerRowIndex + 1; r<data.length; r++) {
                var sRow = data[r];
                var sId = (idIdx > -1) ? String(sRow[idIdx]) : "";
                var sName = (nameIdx > -1) ? String(sRow[nameIdx]) : "";
                
                var lat = (latIdx > -1) ? sRow[latIdx] : "";
                var long = (longIdx > -1) ? sRow[longIdx] : "";
                var gps = (lat && long) ? lat + "," + long : "";
                
                var keys = [];
                if(sId) keys.push(sId);
                if(sName) keys.push(sName);
                if(sId && sName) keys.push(sId + " " + sName);
                
                keys.forEach(function(key) {
                    if(provIdx > -1 && sRow[provIdx]) storeData.provinceMap[key] = String(sRow[provIdx]);
                    if(addrIdx > -1 && sRow[addrIdx]) storeData.addressMap[key] = String(sRow[addrIdx]);
                    if(nameIdx > -1 && sRow[nameIdx]) storeData.nameMap[key] = String(sRow[nameIdx]);
                    if(gps) storeData.gpsMap[key] = gps;
                });
            }
        }
        
        // Cache the result
        cache.put(STORE_CACHE_KEY, JSON.stringify(storeData), CACHE_DURATION);
        console.log("Store database cached: " + Object.keys(storeData.gpsMap).length + " entries");
        
    } catch (e) {
        console.warn("Store DB Load Error: " + e.toString());
    }
    
    return storeData;
}

function processTripPlanForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        
        // Define desired headers (column validation)
        var desiredHeaders = ["Timestamp", "ID", "Employee ID", "Project/Task", "Details", "Priority", "Deadline", "Status", 
                              "Approved By", "Approval Date", "Evidence URL", "Rating", "Creation Attachment", "Start Date", 
                              "Work Doc Number", "Estimated Distance", "Work Type", "Contract", "Vendor", "Station", "Itinerary_JSON"];
        
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Trip_Plans");
            sheet.appendRow(desiredHeaders);
        }
        
        // --- Dynamic Column Mapping ---
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var rowData = new Array(headers.length).fill(""); // Initialize with empty strings

        // --- Ensure Leave Columns Exist ---
        var extraCols = ["Compensatory Leave", "Personal Leave", "Sick Leave", "Annual Leave"];
        var headerStrs = headers.map(function(h) { return String(h).toLowerCase().trim(); });
        
        extraCols.forEach(function(col) {
             if (headerStrs.indexOf(col.toLowerCase()) === -1) {
                 var newColIdx = headers.length + 1;
                 sheet.getRange(1, newColIdx).setValue(col); // Write to Sheet
                 headers.push(col); // Update local headers array
                 rowData.push(""); // Extend rowData
             }
        });
        
        // Prepare attachment URLs
        var id = "TRIP-" + new Date().getTime(); 
        var attachmentUrls = [];

        // Handle Creation Attachments (Multiple)
        if (form.attachmentList && form.attachmentList.length > 0) {
            var folderName = "Trip_Plans_Attachments";
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
                }
            });
        }
        else if (form.attachmentData && form.attachmentName) {
             var folderName = "Trip_Plans_Attachments";
             var folder;
             var folders = DriveApp.getFoldersByName(folderName);
             if (folders.hasNext()) { folder = folders.next(); }
             else { folder = DriveApp.createFolder(folderName); }
             
             var filename = id + "_" + form.attachmentName;
             var blob = Utilities.newBlob(Utilities.base64Decode(form.attachmentData), form.attachmentMimeType, filename);
             var file = folder.createFile(blob);
             file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
             attachmentUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
        }

        // Map fields to specific headers
        var fieldMap = {
            "Timestamp": new Date(),
            "ID": id,
            "Employee ID": form.empId,
            "Project/Task": form.project,
            "Details": form.details,
            "Priority": form.priority,
            "Deadline": form.deadline,
            "Status": "Pending",
            "Approved By": "",
            "Approval Date": "",
            "Evidence URL": "",
            "Rating": "",
            "Creation Attachment": attachmentUrls.join("\n"),
            "Start Date": form.startDate ? new Date(form.startDate) : "", // Will be formatted by sheet if valid date object or we keep as object
            "Work Doc Number": form.workDocNumber,
            "Estimated Distance": form.estimatedDistance,
            "Work Type": form.workType,
            "Contract": form.contract,
            "Vendor": form.vendor,
            "Station": form.station,
            "Compensatory Leave": form.isCompensatory ? "Yes" : "No",
            "Personal Leave": form.isPersonalLeave ? "Yes" : "No",
            "Sick Leave": form.isSickLeave ? "Yes" : "No",
            "Annual Leave": form.isAnnualLeave ? "Yes" : "No"
        };
        
        // Create a map of Lowercase Header -> Column Index
        var colMap = {};
        for(var i=0; i<headers.length; i++) {
             colMap[headers[i].toString().trim().toLowerCase()] = i;
        }

        // Helper to set value if column exists (Case Insensitive)
        function setVal(key, val) {
             var k = key.toLowerCase();
             if(colMap.hasOwnProperty(k)) {
                 rowData[colMap[k]] = val;
             }
             // Handle Aliases
             if(k === "project/task" && colMap.hasOwnProperty("project")) rowData[colMap["project"]] = val;
             if(k === "deadline" && colMap.hasOwnProperty("finish date")) rowData[colMap["finish date"]] = val;
        }

        // Map fields
        var fieldMap = {
            "Timestamp": new Date(),
            "ID": id,
            "Employee ID": form.empId,
            "Project/Task": form.project,
            "Details": form.details,
            "Priority": form.priority,
            "Deadline": form.deadline,
            "Status": "Pending",
            "Approved By": "",
            "Approval Date": "",
            "Evidence URL": "",
            "Rating": "",
            "Creation Attachment": attachmentUrls.join("\n"),
            "Start Date": form.startDate ? new Date(form.startDate) : "", 
            "Work Doc Number": form.workDocNumber,
            "Estimated Distance": form.estimatedDistance,
            "Work Type": form.workType,
            "Contract": form.contract,
            "Vendor": form.vendor,
            "Station": form.station,
            "Itinerary_JSON": form.itinerary ? JSON.stringify(form.itinerary) : ""
        };
        
        Object.keys(fieldMap).forEach(function(key) {
             var val = fieldMap[key];
             if ((key === "Start Date" || key === "Deadline") && val) {
                  val = Utilities.formatDate(new Date(val), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
             }
             setVal(key, val);
        });
        
        sheet.appendRow(rowData);

        // --- Lookup Store Info for Email ---
        var gps = "";
        var storeName = form.station;
        var address = ""; // Fixed: Initialize address variable

        try {
             var storeSheet = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit").getSheets()[0];
             if (storeSheet) {
                 var storeData = storeSheet.getDataRange().getValues();
                 // Simple linear search for now, optimization later if needed
                 var headers = storeData[0];
                 var latIdx = -1;
                 var longIdx = -1;
                 var nameIdx = -1;
                 var idIdx = -1;
                 var provIdx = -1;
                 var addrIdx = -1; // New Address Index
                 
                  for (var k=0; k<headers.length; k++) {
                    var h = String(headers[k]).trim().toLowerCase();
                    if (h === "latitude" || h.includes("lat")) latIdx = k;
                    if (h === "longitude" || h.includes("long") || h.includes("lng")) longIdx = k;
                    // Updated to prioritize Thai Name and Gold Text ID
                    if (h === "store name(th) (2)" || h === "site name (eng)" || h === "store name") nameIdx = k; 
                    if (h === "gold text" || h === "site id" || h === "store id") idIdx = k;
                    if (h === "province" || h.includes("changwat")) provIdx = k;
                    if (h === "address (4)" || h.includes("address")) addrIdx = k;
                }
                
                // Try to find match
                for(var r=1; r<storeData.length; r++) {
                    var rowName = (nameIdx > -1) ? storeData[r][nameIdx] : "";
                    var rowId = (idIdx > -1) ? storeData[r][idIdx] : "";
                    
                    // Match logic
                    var match = false;
                    if (form.station === rowName) match = true;
                    if (form.station === rowId) match = true;
                    if (form.station === (rowId + " " + rowName)) match = true;
                    if (form.station.split(" ")[0] === rowId) match = true; // Partial ID match
                    
                    if(match) {
                        var lat = (latIdx > -1) ? storeData[r][latIdx] : "";
                        var long = (longIdx > -1) ? storeData[r][longIdx] : "";
                        if (lat && long) gps = lat + "," + long;
                        
                        if(nameIdx > -1) storeName = storeData[r][nameIdx];
                        if(provIdx > -1) province = storeData[r][provIdx];
                        if(addrIdx > -1) address = storeData[r][addrIdx];
                        break;
                    }
                }
             }
        } catch(err) {
            console.log("Store Lookup Error: " + err);
        }
        
        // --- Lookup Employee Name & Dept for Report ---
        var empName = form.empId;
        var empDept = "";
        try {
            var empSheet = findEmployeeSheet();
             if (empSheet) {
                 var empData = empSheet.getDataRange().getValues();
                 // Assuming Col 1 = ID, Col 2 = Name, Col 13 = Dept (based on other functions)
                 for(var j=1; j<empData.length; j++) {
                     if(String(empData[j][1]) === String(form.empId)) {
                         empName = empData[j][2];
                         empDept = empData[j][13];
                         break;
                     }
                 }
             }
        } catch(err) {
             console.log("Emp Lookup Error: " + err);
        }

        // Send Email Notification (only if sendEmail flag is true)
        try {
            if (form.sendEmail === true || form.sendEmail === "true") {
                var emailData = {
                    project: form.project,
                    empId: form.empId,
                    empName: empName,
                    empDept: empDept,
                    station: form.station,
                    storeName: storeName,
                    province: province,
                    address: address, // Fixed: Pass address
                    gps: gps,
                    workType: form.workType,
                    estimatedDistance: form.estimatedDistance,
                    priority: form.priority,
                    startDate: form.startDate,
                    deadline: form.deadline,
                    details: form.details,
                    workDocNumber: form.workDocNumber,
                    contract: form.contract,
                    vendor: form.vendor,
                    itinerary: form.itinerary,
                    additionalEmail: form.additionalEmail
                };
                
                sendTripPlanEmail(emailData, 'REQUEST');
                console.log("Trip Plan Email Sent");
            } else {
                console.log("Trip Plan Email Skipped (sendEmail flag not set)");
            }
            
        } catch (mailErr) {
            console.error("Email Error: " + mailErr.toString());
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getPendingTripPlans(clientEmail) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return { orders: [], isAdmin: isAdmin, user: userEmail };
        
        var data = sheet.getDataRange().getValues();
        var pending = [];
        
        // Helper to find column index by name (ES5 Safe)
        function getColIndex(headers) {
            var names = [];
            for (var i = 1; i < arguments.length; i++) {
                names.push(arguments[i]);
            }
            for (var i = 0; i < headers.length; i++) {
                var h = String(headers[i]).trim().toLowerCase();
                for (var j = 0; j < names.length; j++) {
                    if (h === names[j].toLowerCase()) return i;
                }
            }
            return -1;
        }

        var headers = data[0]; 
        var idIdx = getColIndex(headers, "ID");
        var timeIdx = getColIndex(headers, "Timestamp");
        var empIdIdx = getColIndex(headers, "Employee ID");
        var projIdx = getColIndex(headers, "Project/Task", "Project", "Task", "Project / Task");
        var detIdx = getColIndex(headers, "Details");
        var prioIdx = getColIndex(headers, "Priority");
        var deadIdx = getColIndex(headers, "Deadline", "Finish Date", "End Date");
        var statusIdx = getColIndex(headers, "Status");
        var eviIdx = getColIndex(headers, "Evidence URL", "Evidence");
        var attIdx = getColIndex(headers, "Creation Attachment", "Attachment");
        
        var pending = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var status = (statusIdx > -1) ? row[statusIdx] : "";
            
            if (status === "Pending" || status === "Waiting Approval") {
                var assigneeId = (empIdIdx > -1) ? row[empIdIdx] : "";
                var managerEmail = getManagerEmailForEmployee(assigneeId);
                
                var mnEmailSafe = managerEmail ? managerEmail.toLowerCase() : "";
                var usEmailSafe = userEmail ? userEmail.toLowerCase() : "";
                
                var canApprove = isAdmin || (mnEmailSafe && usEmailSafe && usEmailSafe === mnEmailSafe);
                
                // Format deadline safely
                var deadlineVal = (deadIdx > -1 && row[deadIdx]) ? row[deadIdx] : "";
                var deadlineStr = "";
                if(deadlineVal instanceof Date) {
                    deadlineStr = Utilities.formatDate(deadlineVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
                }
                
                pending.push({
                    id: (idIdx > -1) ? row[idIdx] : "",
                    timestamp: (timeIdx > -1) ? row[timeIdx] : "",
                    empId: assigneeId,
                    project: (projIdx > -1) ? row[projIdx] : "",
                    details: (detIdx > -1) ? row[detIdx] : "",
                    priority: (prioIdx > -1) ? row[prioIdx] : "",
                    deadline: deadlineStr,
                    status: status,
                    evidence: (eviIdx > -1) ? row[eviIdx] : "",
                    attachment: (attIdx > -1) ? row[attIdx] : "",
                    canApprove: canApprove
                });
            }
        }
        
        var empList = getEmployeeList(); 
        var empMap = {};
        empList.forEach(function(e) { empMap[e.id] = e.name; });

        pending.forEach(function(p) {
            p.empName = empMap[p.empId] || p.empId;
        });

        return { 
            orders: pending.reverse(),
            isAdmin: isAdmin,
            user: userEmail
        };

    } catch (e) {
        return { orders: [], isAdmin: false, error: e.toString() };
    }
}

function uploadTripPlanEvidence(id, fileData) {
    try {
        var _wlock = _acquireWriteLock_();
        var folderName = "Trip_Plans_Evidence";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }
        
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1;
        var eviIdx = -1;
        var statusIdx = -1;
        
        for(var k=0; k<headers.length; k++) {
             var h = String(headers[k]).trim().toLowerCase();
             if(h === "id") idIdx = k;
             if(h === "evidence url" || h === "evidence") eviIdx = k;
             if(h === "status") statusIdx = k;
        }
        
        if (idIdx === -1 || eviIdx === -1 || statusIdx === -1) {
             return { success: false, error: "Critical columns (ID, Status, Evidence) not found." };
        }

        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idIdx] == id) {
                rowIndex = i + 1;
                break;
            }
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, eviIdx + 1).setValue(fileUrl); 
            sheet.getRange(rowIndex, statusIdx + 1).setValue("Waiting Approval"); 
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
         return { success: false, error: e.toString() };
    }
}

// Helper to check if an employee has subordinates (is a manager)
function hasSubordinates(empEmail) {
    try {
        var sheet = findEmployeeSheet();
        if (!sheet) return false;
        
        var data = sheet.getDataRange().getValues();
        
        // Find the employee's name from their email
        var empName = "";
        for (var i = 1; i < data.length; i++) {
            var rowEmail = data[i][6]; // Col 6 is Email
            if (rowEmail && String(rowEmail).toLowerCase().trim() === String(empEmail).toLowerCase().trim()) {
                empName = data[i][2]; // Col 2 is Full Name
                break;
            }
        }
        
        if (!empName) return false;
        
        // Check if this employee is listed as "Direct Manager" for anyone
        for (var i = 1; i < data.length; i++) {
            var managerName = data[i][4]; // Col 4 is Direct Manager
            if (managerName && String(managerName).trim() === String(empName).trim()) {
                return true; // This employee manages at least one person
            }
        }
        
        return false; // No subordinates found
    } catch (e) {
        console.error("Error checking subordinates: " + e.toString());
        return false;
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
            if (String(data[i][1]) === String(empId)) { // Col 1 is Employee ID
                directManagerName = data[i][4]; // Col 4 is Direct Manager
                break;
            }
        }
        
        if (!directManagerName) return null;
        
        // Now find the direct manager's manager (n+2)
        for (var i = 1; i < data.length; i++) {
            if (data[i][2] && String(data[i][2]).trim() === String(directManagerName).trim()) { // Col 2 is Full Name
                var managersManagerName = data[i][4]; // This manager's Direct Manager
                if (!managersManagerName) return null;
                
                // Find the email of n+2
                for (var j = 1; j < data.length; j++) {
                    if (data[j][2] && String(data[j][2]).trim() === String(managersManagerName).trim()) {
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

function approveTripPlan(workOrderId, approverNameInput, rating, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        console.log("approveTripPlan called by:", userEmail, "for Order:", workOrderId);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1;
        var empIdIdx = -1;
        var statusIdx = -1;
        var appByIdx = -1;
        var appDateIdx = -1;
        var ratingIdx = -1;
        var projIdx = -1;
        var stationIdx = -1;
        var workTypeIdx = -1;
        var estDistIdx = -1;
        var prioIdx = -1;
        var startIdx = -1;
        var deadIdx = -1;
        var detIdx = -1;
        var docNumIdx = -1;
        var contractIdx = -1;
        var vendorIdx = -1;
        var itineraryIdx = -1;

        for(var k=0; k<headers.length; k++) {
             var h = String(headers[k]).trim().toLowerCase();
             if(h === "id") idIdx = k;
             if(h === "employee id") empIdIdx = k;
             if(h === "status") statusIdx = k;
             if(h === "approved by") appByIdx = k;
             if(h === "approval date") appDateIdx = k;
             if(h === "rating") ratingIdx = k;
             if(h === "project/task" || h === "project") projIdx = k;
             if(h === "station" || h === "store") stationIdx = k;
             if(h === "work type" || h === "type") workTypeIdx = k;
             if(h === "estimated distance") estDistIdx = k;
             if(h === "priority") prioIdx = k;
             if(h === "start date") startIdx = k;
             if(h === "deadline") deadIdx = k;
             if(h === "details") detIdx = k;
             if(h === "work doc number") docNumIdx = k;
             if(h === "contract") contractIdx = k;
             if(h === "vendor") vendorIdx = k;
             if(h === "itinerary_json") itineraryIdx = k;
        }

        if (idIdx === -1 || statusIdx === -1) {
             return { success: false, error: "Critical columns missing." };
        }

        var rowIndex = -1;
        var empId = null;
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][idIdx] == workOrderId) {
                rowIndex = i + 1;
                empId = (empIdIdx > -1) ? data[i][empIdIdx] : "";
                break;
            }
        }
        
        // --- RESOLVE APPROVER NAME FROM DB ---
        // Fix: Ignore frontend input default "Manager", fallback to email if name not found
        var realApproverName = userEmail; 
        try {
            var empSheet = findEmployeeSheet();
            var eData = empSheet.getDataRange().getValues();
            for(var k=1; k<eData.length; k++) {
                // Col 6 is Email, Col 2 is Name
                if(String(eData[k][6]).trim().toLowerCase() === String(userEmail).trim().toLowerCase()) {
                    realApproverName = eData[k][2];
                    break;
                }
            }
        } catch(e) { console.warn("Could not resolve approver name:", e); }
        // -------------------------------------
        
        // Check if user is admin (DB Only)
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isAdmin = dbAdminCheck.isAdmin;
        
        // Get n+1 (direct manager) and n+2 (manager's manager)
        var managerEmail = getManagerEmailForEmployee(empId); // n+1
        var managersManagerEmail = getManagersManagerEmail(empId); // n+2
        
        var isDirectManager = (userEmail && managerEmail && userEmail.toLowerCase() === managerEmail.toLowerCase());
        var isManagersManager = (userEmail && managersManagerEmail && userEmail.toLowerCase() === managersManagerEmail.toLowerCase());
        
        // Check if user has subordinates (is a manager in org chart)
        var userHasSubordinates = hasSubordinates(userEmail);
        
        console.log("Perm Check - IsAdmin:", isAdmin, "IsDirect:", isDirectManager, "IsN2:", isManagersManager, "HasSubord:", userHasSubordinates);

        // Access control: Admin can approve all, OR n+1 (direct manager), OR n+2 (manager's manager)
        if (!isAdmin && !isDirectManager && !isManagersManager) {
             return { success: false, error: "Access Denied: Only the direct manager (n+1), their manager (n+2), or Admin can approve." };
        }
        
        if (rowIndex > 0) {
            // Update Status
            sheet.getRange(rowIndex, statusIdx + 1).setValue("See Detail"); // Approved state often mapped to See Detail or similar
            
            // Update Approver Info
            if(appByIdx > -1) sheet.getRange(rowIndex, appByIdx + 1).setValue(realApproverName);
            if(appDateIdx > -1) sheet.getRange(rowIndex, appDateIdx + 1).setValue(new Date());
            
            // Handle Rating
            if (ratingIdx > -1 && rating) {
                sheet.getRange(rowIndex, ratingIdx + 1).setValue(rating);
            }
            
            // --- Send Appoval Notification ---
            try {
                // We need to re-fetch row data or construct it. Re-reading is safer.
                var updatedRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
                var getVal = (idx) => (idx > -1) ? updatedRow[idx] : "";
                
                var emailData = {
                    project: getVal(projIdx),
                    empId: empId, // Already have this
                    station: getVal(stationIdx),
                    workType: getVal(workTypeIdx),
                    estimatedDistance: getVal(estDistIdx),
                    priority: getVal(prioIdx),
                    startDate: getVal(startIdx),
                    deadline: getVal(deadIdx),
                    details: getVal(detIdx),
                    workDocNumber: getVal(docNumIdx),
                    contract: getVal(contractIdx),
                    vendor: getVal(vendorIdx),
                    itinerary: (() => { 
                        try { return JSON.parse(getVal(itineraryIdx)); } 
                        catch(e) { return []; } 
                    })(),
                    approver: realApproverName
                };
                
                sendTripPlanEmail(emailData, 'APPROVED');
                
            } catch(e) { console.warn("Approve Email Fail:", e); }
            // ---------------------------------

            return { success: true };
        } else {
            return { success: false, error: "Order not found in Trip Plan database" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function rejectTripPlan(workOrderId, rejectorName, reason, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1;
        var empIdIdx = -1;
        var statusIdx = -1;
        var appByIdx = -1;
        var appDateIdx = -1;
        var projIdx = -1;
        var stationIdx = -1;
        var workTypeIdx = -1;
        var startIdx = -1;
        var detIdx = -1;

        for(var k=0; k<headers.length; k++) {
             var h = String(headers[k]).trim().toLowerCase();
             if(h === "id") idIdx = k;
             if(h === "employee id") empIdIdx = k;
             if(h === "status") statusIdx = k;
             if(h === "approved by") appByIdx = k;
             if(h === "approval date") appDateIdx = k;
             if(h === "project/task" || h === "project") projIdx = k;
             if(h === "station" || h === "store") stationIdx = k;
             if(h === "work type") workTypeIdx = k;
             if(h === "start date") startIdx = k;
             if(h === "details") detIdx = k;
        }

        if (idIdx === -1 || statusIdx === -1) {
             return { success: false, error: "Critical columns missing." };
        }

        var rowIndex = -1;
        var empId = null;
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][idIdx] == workOrderId) {
                rowIndex = i + 1;
                empId = (empIdIdx > -1) ? data[i][empIdIdx] : "";
                break;
            }
        }
        
        // Check if user is admin (DB Only)
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isAdmin = dbAdminCheck.isAdmin;
        
        // Get n+1 (direct manager) and n+2 (manager's manager)
        var managerEmail = getManagerEmailForEmployee(empId); // n+1
        var managersManagerEmail = getManagersManagerEmail(empId); // n+2
        
        console.log("Reject Check - User:", userEmail);
        console.log("Target Emp:", empId, "DirectMgrEmail:", managerEmail, "MgrMgrEmail:", managersManagerEmail);
        console.log("IsAdmin:", isAdmin);
        
        var isDirectManager = (userEmail && managerEmail && userEmail.toLowerCase() === managerEmail.toLowerCase());
        var isManagersManager = (userEmail && managersManagerEmail && userEmail.toLowerCase() === managersManagerEmail.toLowerCase());
        
        // Check if user has subordinates (is a manager in org chart)
        var userHasSubordinates = hasSubordinates(userEmail);
        
        // Access control: Admin can reject all, OR n+1 (direct manager), OR n+2 (manager's manager)
        if (!isAdmin && !isDirectManager && !isManagersManager) {
             return { success: false, error: "Access Denied: Only the direct manager (n+1), their manager (n+2), or Admin can reject." };
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, statusIdx + 1).setValue("Rejected"); 
            if(appByIdx > -1) sheet.getRange(rowIndex, appByIdx + 1).setValue("Rejected by " + rejectorName + (reason ? ": " + reason : "")); 
            if(appDateIdx > -1) sheet.getRange(rowIndex, appDateIdx + 1).setValue(new Date()); 
            
            // --- Send Rejection Notification ---
            try {
                var updatedRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
                var getVal = (idx) => (idx > -1) ? updatedRow[idx] : "";
                
                var emailData = {
                     project: getVal(projIdx),
                     empId: empId,
                     station: getVal(stationIdx),
                     workType: getVal(workTypeIdx),
                     startDate: getVal(startIdx),
                     details: getVal(detIdx),
                     rejector: rejectorName,
                     rejectReason: reason
                };
                
                sendTripPlanEmail(emailData, 'REJECTED');
            } catch(e) { console.warn("Reject Email Fail:", e); }
            // ----------------------------------
            
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getAllTripPlansReport(clientEmail) {
    try {
        console.log("getAllTripPlansReport: Starting...");
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isAdmin = dbAdminCheck.isAdmin;
        console.log("User:", userEmail, "isAdmin:", isAdmin);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) {
            console.log("Trip_Plans sheet not found");
            return JSON.stringify({ orders: [], isAdmin: isAdmin });
        }
        
        console.log("Reading sheet data...");
        var data = sheet.getDataRange().getValues();
        console.log("Total rows:", data.length);
        var headers = data[0];
        
        // Helper to find column index (Safe ES5)
        function getColIndex(headers) {
            var names = [];
            for (var i = 1; i < arguments.length; i++) { names.push(arguments[i]); }
            for (var i = 0; i < headers.length; i++) {
                var h = String(headers[i]).trim().toLowerCase();
                for (var j = 0; j < names.length; j++) {
                     if (h === names[j].toLowerCase()) return i;
                }
            }
            return -1;
        }

        var timeIdx = getColIndex(headers, "Timestamp");
        var idIdx = getColIndex(headers, "ID");
        var empIdIdx = getColIndex(headers, "Employee ID");
        var projIdx = getColIndex(headers, "Project/Task", "Project", "Task", "Project / Task");
        var detIdx = getColIndex(headers, "Details");
        var prioIdx = getColIndex(headers, "Priority");
        var deadIdx = getColIndex(headers, "Deadline", "Finish Date", "End Date");
        var statusIdx = getColIndex(headers, "Status");
        var appByIdx = getColIndex(headers, "Approved By");
        var appDateIdx = getColIndex(headers, "Approval Date");
        var eviIdx = getColIndex(headers, "Evidence URL", "Evidence Link", "Evidence");
        var ratingIdx = getColIndex(headers, "Rating");
        var createAttIdx = getColIndex(headers, "Creation Attachment", "Attachment");
        var startIdx = getColIndex(headers, "Start Date", "Start");
        var docIdx = getColIndex(headers, "Work Doc Number", "Work Doc", "Doc Number");
        var distIdx = getColIndex(headers, "Estimated Distance", "Distance", "Est. Distance");
        var typeIdx = getColIndex(headers, "Work Type", "Type");
        var conIdx = getColIndex(headers, "Contract");
        var venIdx = getColIndex(headers, "Vendor");
        var stationIdx = getColIndex(headers, "Station", "Site", "Store", "Destination");
        var itineraryIdx = getColIndex(headers, "Itinerary_JSON", "Itinerary");
        // Check-in Columns
        var ciTimeIdx = getColIndex(headers, "Check In Time", "Check-in Time");
        var ciStatusIdx = getColIndex(headers, "Check In Status", "Check-in Status");
        var ciDistIdx = getColIndex(headers, "Check In Distance", "Check-in Distance");
        var ciLatIdx = getColIndex(headers, "Check In Lat");
        var ciLngIdx = getColIndex(headers, "Check In Lng");
        var addEmailIdx = getColIndex(headers, "Additional Email", "Notify Email");

        console.log("Building orders array...");
        var orders = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            
            // Inline helpers for speed/safety
            var getVal = function(idx) { return (idx > -1 && row[idx] !== undefined) ? row[idx] : ""; };
            var formatDate = function(idx) {
                var v = getVal(idx);
                // Safe date format
                if (v && Object.prototype.toString.call(v) === "[object Date]") {
                     return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
                }
                return v;
            };
            var formatDateTime = function(idx) {
                 var v = getVal(idx);
                 if (v && Object.prototype.toString.call(v) === "[object Date]") {
                     return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
                 }
                 return v;
            };

            orders.push({
                timestamp: formatDateTime(timeIdx),
                id: getVal(idIdx),
                empId: getVal(empIdIdx),
                project: getVal(projIdx),
                details: getVal(detIdx),
                priority: getVal(prioIdx),
                deadline: formatDateTime(deadIdx),
                status: getVal(statusIdx),
                approvedBy: getVal(appByIdx),
                approvalDate: formatDate(appDateIdx),
                evidence: getVal(eviIdx),
                rating: getVal(ratingIdx),
                creationAttachment: getVal(createAttIdx),
                startDate: formatDateTime(startIdx),
                workDocNumber: getVal(docIdx),
                estimatedDistance: getVal(distIdx),
                workType: getVal(typeIdx),
                contract: getVal(conIdx),
                vendor: getVal(venIdx),
                station: getVal(stationIdx),
                // Check-in Data
                checkInTime: formatDateTime(ciTimeIdx),
                checkInStatus: getVal(ciStatusIdx),
                checkInDistance: getVal(ciDistIdx),
                checkInLat: getVal(ciLatIdx),
                checkInLng: getVal(ciLngIdx),
                additionalEmail: getVal(addEmailIdx)
            });
        }
        
        console.log("Orders built:", orders.length);
        console.log("Loading employee data...");
        
        // 1. Resolve Names (Internal DB - Safe) - Build efficient lookup maps
        var empMap = {}; var deptMap = {}; var zoneMap = {}; var managerMap = {}; var roleMap = {};
        var nicknameMap = {}; // empId -> nickname
        var empEmailMap = {}; // empId -> email
        var empIdByNameMap = {}; // name -> empId
        var nameByEmailMap = {}; // email -> name
        var managerEmailMap = {}; // empId -> manager's email
        var managersManagerEmailMap = {}; // empId -> manager's manager's email
        
        var numericIdMap = {}; // int -> empId (for fallback "123" vs "00123")

        try {
            var empSheet = findEmployeeSheet();
            if(empSheet) {
                var empData = empSheet.getDataRange().getValues();
                
                // First pass: Build basic maps
                for(var j=1; j<empData.length; j++) {
                    var eid = String(empData[j][1]).trim();
                    var name = empData[j][2];
                    var nickname = empData[j][3]; // Column 3 is Nickname
                    var email = empData[j][6];
                    var managerName = empData[j][4];
                    
                    if(eid) {
                        empMap[eid] = name;
                        nicknameMap[eid] = nickname || ""; // Store nickname
                        managerMap[eid] = managerName;
                        deptMap[eid] = empData[j][13];
                        zoneMap[eid] = empData[j][8];
                        roleMap[eid] = empData[j][5]; // Position
                        if(email) empEmailMap[eid] = String(email).toLowerCase();
                        
                        // Populate Numeric Map (if eid is a number)
                        if (/^\d+$/.test(eid)) {
                            numericIdMap[parseInt(eid, 10)] = eid;
                        }
                    }
                    if(name) empIdByNameMap[String(name).trim()] = eid;
                    if(email) nameByEmailMap[String(email).toLowerCase()] = name;
                }
                
                // Second pass: Build manager email maps
                for(var j=1; j<empData.length; j++) {
                    var eid = String(empData[j][1]).trim();
                    var managerName = empData[j][4];
                    
                    if(eid && managerName) {
                        // Find manager's empId
                        var managerId = empIdByNameMap[String(managerName).trim()];
                        if(managerId && empEmailMap[managerId]) {
                            managerEmailMap[eid] = empEmailMap[managerId];
                            
                            // Find manager's manager (n+2)
                            var managersManagerName = managerMap[managerId];
                            if(managersManagerName) {
                                var managersManagerId = empIdByNameMap[String(managersManagerName).trim()];
                                if(managersManagerId && empEmailMap[managersManagerId]) {
                                    managersManagerEmailMap[eid] = empEmailMap[managersManagerId];
                                }
                            }
                        }
                    }
                }
            }
        } catch(e) { console.warn("Emp DB Error: " + e); }
        
        console.log("Employee data processed. Checking subordinates...");
        
        // Check if current user has subordinates (is a manager)
        var userHasSubordinates = false;
        var userName = nameByEmailMap[userEmail.toLowerCase()];
        if(userName) {
            for(var empId in managerMap) {
                if(String(managerMap[empId]).trim() === String(userName).trim()) {
                    userHasSubordinates = true;
                    break;
                }
            }
        }

        console.log("User has subordinates:", userHasSubordinates);
        console.log("Loading store database...");
        
        // 2. Resolve Store Data (Using Cache)
        var storeData = loadStoreDatabase();
        var provinceMap = storeData.provinceMap;
        var gpsMap = storeData.gpsMap;
        var nameMap = storeData.nameMap;
        var addressMap = storeData.addressMap;

        console.log("Store database loaded. Enriching orders...");
        
        // NEW: Check DB Admin Status
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isDbAdmin = dbAdminCheck.isAdmin;
        var isGlobalAdmin = isDbAdmin;

        orders.forEach(function(p) {
            var lookupId = String(p.empId).trim(); // Normalize ID for lookup
            
            // Smart Resolve: If ID not found, try Name, Email, or Numeric ID
            if (!empMap[lookupId]) {
                // 1. Try Name Case-Insensitive
                var tryIdByName = empIdByNameMap[lookupId]; 
                if (tryIdByName) {
                    lookupId = tryIdByName;
                } else if (lookupId.indexOf("@") > -1) {
                    // 2. Try Email
                    var nameFromEmail = nameByEmailMap[lookupId.toLowerCase()];
                    var tryIdByEmail = nameFromEmail ? empIdByNameMap[nameFromEmail] : null;
                    if (tryIdByEmail) {
                        lookupId = tryIdByEmail;
                    }
                } else if (/^\d+$/.test(lookupId)) {
                    // 3. Try Numeric Fallback (e.g. "123" -> find "00123")
                    var numericVal = parseInt(lookupId, 10);
                    var canonicalId = numericIdMap[numericVal];
                    if (canonicalId) {
                        lookupId = canonicalId;
                    }
                }
            }
            
            var resolvedName = empMap[lookupId];
            if (!resolvedName && p.empId && String(p.empId).trim().length > 0) {
                 resolvedName = p.empId;
            }
            p.empName = resolvedName || "Unknown";

            p.empNickname = nicknameMap[lookupId] || ""; // Add nickname
            p.department = deptMap[lookupId] || "-";
            p.managerName = managerMap[lookupId] || "-";
            p.zone = zoneMap[lookupId] || "-";

            // Resolve Approver Role
            if (p.approvedBy) {
                var val = String(p.approvedBy).trim();
                var approverEmpId = empIdByNameMap[val];

                // If Name not found, try resolving via Email (e.g. if fallback was used)
                if (!approverEmpId && val.indexOf('@') > -1) {
                    var resolvedName = nameByEmailMap[val.toLowerCase()];
                    if (resolvedName) {
                        approverEmpId = empIdByNameMap[String(resolvedName).trim()];
                        p.approvedBy = resolvedName; // Update display name to real Name!
                    }
                }

                if (approverEmpId) {
                    p.approvedByRole = roleMap[approverEmpId] || "Manager"; 
                } else {
                    p.approvedByRole = "Manager"; 
                }
            } else {
                p.approvedByRole = "";
            }
            
            // Extract Store ID from station (Format: "ID-Name" or "ID Name" or just "ID")
            var stationKey = p.station;
            var storeIdFromStation = "";
            if (p.station) {
                // Try splitting by hyphen first (new format), then space (old format)
                var parts = String(p.station).split("-");
                if (parts.length > 1) {
                    storeIdFromStation = parts[0].trim();
                } else {
                    storeIdFromStation = String(p.station).split(" ")[0].trim();
                }
            }
            
            // Try lookup with full station first, then Store ID, then combined
            p.province = provinceMap[stationKey] || provinceMap[storeIdFromStation] || "-";
            p.gps = gpsMap[stationKey] || gpsMap[storeIdFromStation] || "";
            p.storeName = nameMap[stationKey] || nameMap[storeIdFromStation] || p.station;
            p.address = addressMap[stationKey] || addressMap[storeIdFromStation] || "";
            
            // Determine if current user can approve this trip plan (using pre-built maps)
            var requestorManagerEmail = managerEmailMap[p.empId]; // n+1
            var requestorManagersManagerEmail = managersManagerEmailMap[p.empId]; // n+2
            
            var isDirectManager = (requestorManagerEmail && userEmail && requestorManagerEmail.toLowerCase() === userEmail.toLowerCase());
            var isManagersManager = (requestorManagersManagerEmail && userEmail && requestorManagersManagerEmail.toLowerCase() === userEmail.toLowerCase());
            
            // User can approve if:
            // 1. They are admin (Hardcoded or DB), OR
            // 2. They are the direct manager (n+1), OR
            // 3. They are the manager's manager (n+2)
            p.canApprove = isGlobalAdmin || isDirectManager || isManagersManager;
                          
            p.empEmail = empEmailMap[lookupId] || ""; // Add email for permission checks
            p.checkInStatus = p.checkInStatus || ""; // Ensure field exists

            // Debug Info for Frontend
            p.debugPermission = "User: " + userEmail + 
                                " | IsGlobalAdmin: " + isGlobalAdmin +
                                " | DirectMgr: " + requestorManagerEmail + 
                                " | N2Mgr: " + requestorManagersManagerEmail +
                                " | IsDirect: " + isDirectManager +
                                " | IsN2: " + isManagersManager +
                                " | HasSubordinates: " + userHasSubordinates;
        });

        console.log("Orders enriched. Preparing result...");
        
        // Return as STRING to avoid serialization nulls
        var result = { 
            orders: orders.reverse(), 
            isAdmin: isAdmin, 
            debug: "Recovered",
            adminLogs: dbAdminCheck.logs || [],
            storeDbStats: {
                totalGps: Object.keys(gpsMap).length,
                totalNames: Object.keys(nameMap).length,
                sampleKey: Object.keys(gpsMap)[0] || "None"
            },
            sheetStats: {
                rowCount: data.length,
                headers: headers.join(", ")
            }
        };
        console.log("Stringifying result...");
        var jsonResult = JSON.stringify(result);
        console.log("Result size:", jsonResult.length, "characters");
        console.log("getAllTripPlansReport: Complete");
        return jsonResult;

    } catch (e) {
        console.error("getAllTripPlansReport error:", e.toString());
        return JSON.stringify({ orders: [], error: "Critical Error: " + e.toString() });
    }
}

function updateTripPlan(form, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1;
        var empIdIdx = -1;
        var projIdx = -1;
        var detIdx = -1;
        var prioIdx = -1;
        var deadIdx = -1; // Finish Date
        var startIdx = -1; // Start Date
        var statusIdx = -1;
        var appByIdx = -1;
        var appDateIdx = -1;
        var ratingIdx = -1;
        var stationIdx = -1;
        var typeIdx = -1;
        var conIdx = -1;
        var venIdx = -1;
        var distIdx = -1;
        var docIdx = -1;
        var addEmailIdx = -1;

        for(var k=0; k<headers.length; k++) {
             var h = String(headers[k]).trim().toLowerCase();
             if(h === "id") idIdx = k;
             if(h === "employee id") empIdIdx = k;
             if(h === "project/task") projIdx = k;
             if(h === "details") detIdx = k;
             if(h === "priority") prioIdx = k;
             if(h === "deadline" || h === "finish date") deadIdx = k;
             if(h === "start date") startIdx = k;
             if(h === "status") statusIdx = k;
             if(h === "approved by") appByIdx = k;
             if(h === "approval date") appDateIdx = k;
             if(h === "rating") ratingIdx = k;
             if(h === "station") stationIdx = k;
             if(h === "work type" || h === "type") typeIdx = k;
             if(h === "contract") conIdx = k;
             if(h === "vendor") venIdx = k;
             if(h === "estimated distance" || h === "distance") distIdx = k;
             if(h === "work doc number" || h === "work doc") docIdx = k;
             if(h === "additional email" || h === "notify email") addEmailIdx = k;
        }

        if (idIdx === -1) {
             return { success: false, error: "Critical ID column not found." };
        }

        var rowIndex = -1;
        var requesterId = null;

        // Find row by ID (Col 1)
        for (var i = 1; i < data.length; i++) {
            if (data[i][idIdx] == form.id) {
                rowIndex = i + 1;
                if (empIdIdx > -1) {
                    requesterId = data[i][empIdIdx];
                }
                break;
            }
        }
        
        // Permission Check: Admin OR n+2 of SMF team member
        // Admin (DB Only)
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isAdmin = dbAdminCheck.isAdmin;
        
        var isN2SMF = false;
        if (requesterId) {
            isN2SMF = isN2OfSMFTeamMember(userEmail, requesterId);
        }
        
        if (!isAdmin && !isN2SMF) {
            return { success: false, error: "Access Denied: Only Admin or n+2 manager of SMF team members can edit trip plans." };
        }

        if (rowIndex > 0) {
            // Update Allowed Fields
            if(projIdx > -1) sheet.getRange(rowIndex, projIdx + 1).setValue(form.project);
            if(detIdx > -1) sheet.getRange(rowIndex, detIdx + 1).setValue(form.details);
            if(prioIdx > -1) sheet.getRange(rowIndex, prioIdx + 1).setValue(form.priority);
            if (form.deadline && deadIdx > -1) sheet.getRange(rowIndex, deadIdx + 1).setValue(new Date(form.deadline));
            
            // Handle Start Date Update (Added)
            if (form.startDate && startIdx > -1) sheet.getRange(rowIndex, startIdx + 1).setValue(new Date(form.startDate));

            // Handle Status Update
            if(statusIdx > -1) {
                var currentStatus = sheet.getRange(rowIndex, statusIdx + 1).getValue();
                if (form.status && form.status !== currentStatus) {
                    sheet.getRange(rowIndex, statusIdx + 1).setValue(form.status);
                    
                    // If closing/approving, record who did it
                    if (form.status === 'Closed' || form.status === 'Approved') {
                         // If approverEmail is passed, try to resolve name, else use email
                         var approver = form.approverEmail || Session.getActiveUser().getEmail();
                         
                         // Try to find name from email logic? For now simple.
                         if (form.approverEmail) {
                              var empSheet = findEmployeeSheet();
                              var eData = empSheet.getDataRange().getValues();
                              for(var k=1; k<eData.length; k++) {
                                  if(eData[k][6] === form.approverEmail) {
                                      approver = eData[k][2]; // Return Name
                                      break;
                                  }
                              }
                         }
                         if(appByIdx > -1) sheet.getRange(rowIndex, appByIdx + 1).setValue(approver);
                         if(appDateIdx > -1) sheet.getRange(rowIndex, appDateIdx + 1).setValue(new Date());
                    }
                }
            }

            // Handle Station Update
            if (form.station && stationIdx > -1) {
                sheet.getRange(rowIndex, stationIdx + 1).setValue(form.station);
            }

            // Handle Rating
            if (form.rating && ratingIdx > -1) {
                sheet.getRange(rowIndex, ratingIdx + 1).setValue(form.rating);
            }

            // Handle New Editable Fields
            if (typeIdx > -1 && form.workType !== undefined) sheet.getRange(rowIndex, typeIdx + 1).setValue(form.workType);
            if (conIdx > -1 && form.contract !== undefined) sheet.getRange(rowIndex, conIdx + 1).setValue(form.contract);
            if (venIdx > -1 && form.vendor !== undefined) sheet.getRange(rowIndex, venIdx + 1).setValue(form.vendor);
            if (distIdx > -1 && form.estimatedDistance !== undefined) sheet.getRange(rowIndex, distIdx + 1).setValue(form.estimatedDistance);
            if (docIdx > -1 && form.workDocNumber !== undefined) sheet.getRange(rowIndex, docIdx + 1).setValue(form.workDocNumber);
            if (addEmailIdx > -1 && form.additionalEmail !== undefined) sheet.getRange(rowIndex, addEmailIdx + 1).setValue(form.additionalEmail);

            // --- Handle Attachment Updates ---
            if (form.attachmentList && form.attachmentList.length > 0) {
                var newUrls = saveTripAttachments(tripPlanId, form.attachmentList);
                if (newUrls.length > 0) {
                    var createAttIdx = -1;
                    // Find Creation Attachment column again (or use cached if reliable but re-finding is safer)
                    for(var k=0; k<headers.length; k++) {
                        var h = String(headers[k]).trim().toLowerCase();
                        if(h.includes("creation attachment") || h === "attachment") createAttIdx = k;
                    }

                    if (createAttIdx > -1) {
                        var currentVal = sheet.getRange(rowIndex, createAttIdx + 1).getValue();
                        var newVal = currentVal ? (currentVal + "\n" + newUrls.join("\n")) : newUrls.join("\n");
                        sheet.getRange(rowIndex, createAttIdx + 1).setValue(newVal);
                    }
                }
            }

            return { success: true };
        } else {
            return { success: false, error: "Order not found in Trip Plan database" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Helper to save attachments to Drive
function saveTripAttachments(uniqueId, attachmentList) {
    var folderName = "Trip_Plans_Attachments";
    var folder;
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) { folder = folders.next(); }
    else { folder = DriveApp.createFolder(folderName); }
    
    var urls = [];
    attachmentList.forEach(function(att) {
        if(att.data && att.name) {
            var filename = uniqueId + "_" + att.name;
            var blob = Utilities.newBlob(Utilities.base64Decode(att.data), att.mimeType, filename);
            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            urls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
        }
    });
    return urls;
}

// Delete Trip Plan (Admin or n+2 of SMF team only)
function deleteTripPlan(tripPlanId, clientEmail) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var dbAdminCheck = checkAdminStatus(userEmail); 
        var isAdmin = dbAdminCheck.isAdmin;
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1;
        var empIdIdx = -1;
        for(var k=0; k<headers.length; k++) {
             var h = String(headers[k]).trim().toLowerCase();
             if(h === "id") idIdx = k;
             if(h === "employee id") empIdIdx = k;
        }
        
        if (idIdx === -1) {
            return { success: false, error: "Critical ID column not found." };
        }
        
        var rowIndex = -1;
        var requesterId = null;
        
        // Find row by ID
        for (var i = 1; i < data.length; i++) {
            if (data[i][idIdx] == tripPlanId) {
                rowIndex = i + 1; // 1-based index
                if (empIdIdx > -1) {
                    requesterId = data[i][empIdIdx];
                }
                break;
            }
        }
        
        if (rowIndex === -1) {
            return { success: false, error: "Trip plan not found" };
        }
        
        // Permission Check: Admin OR n+2 of SMF team member
        // 1. Super Admin (Hardcoded)
        var isSuperAdmin = (userEmail === ADMIN_EMAIL);
        
        // 2. DB Admin (from Employee Database)
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isDbAdmin = dbAdminCheck.isAdmin;
        var isAdmin = isSuperAdmin || isDbAdmin;

        var isN2SMF = false;
        if (requesterId) {
            isN2SMF = isN2OfSMFTeamMember(userEmail, requesterId);
        }
        
        if (!isAdmin && !isN2SMF) {
            return { success: false, error: "Access Denied: Only Admin or n+2 manager of SMF team members can delete trip plans." };
        }
        
        // Delete the row
        sheet.deleteRow(rowIndex);
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Get GPS coordinates for multiple locations
function getGPSDataForLocations(locations) {
    return [];
}

// --- Unified Email Helper ---
function sendTripPlanEmail(data, type) {
    try {
        var subject = "";
        var headerColor = "";
        var headerText = "";
        var introText = "";
        
        if (type === 'REQUEST') {
            subject = "Trip Plan Request: " + data.project + " (Pending)";
            headerColor = "#1a73e8"; // Blue
            headerText = "Trip Plan Request";
            introText = "A new Trip Plan request has been submitted and is pending review.";
        } else if (type === 'APPROVED') {
            subject = "Trip Plan Approved: " + data.project;
            headerColor = "#1e8e3e"; // Green
            headerText = "Trip Plan Approved";
            introText = "Good news! The following Trip Plan has been <strong>APPROVED</strong> by " + (data.approver || "Manager") + ".";
        } else if (type === 'REJECTED') {
            subject = "Trip Plan Rejected: " + data.project;
            headerColor = "#d93025"; // Red
            headerText = "Trip Plan Rejected";
            introText = "The following Trip Plan has been <strong>REJECTED</strong> by " + (data.rejector || "Manager") + ".<br>Reason: " + (data.rejectReason || "-");
        }
        
        // Resolve Employee Details if missing
        if (!data.empName || !data.empDept) {
            try {
                var empSheet = findEmployeeSheet();
                 if (empSheet) {
                     var empData = empSheet.getDataRange().getValues();
                     for(var j=1; j<empData.length; j++) {
                         if(String(empData[j][1]) === String(data.empId)) {
                             data.empName = empData[j][2];
                             data.empDept = empData[j][13];
                             break;
                         }
                     }
                 }
            } catch(e) {}
        }
        
        // Resolve Store/GPS if missing (for Approval/Rejection flows where we only have station)
        if (!data.storeName || !data.gps) {
             data.storeName = data.storeName || data.station;
        }

        var mapLink = data.gps ? "https://maps.google.com/?q=" + data.gps : "#";
        var mapLabel = data.gps ? "View Map" : "No GPS";

        var htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: ${headerColor}; margin-top: 0; border-bottom: 2px solid ${headerColor}; padding-bottom: 10px;">${headerText}</h2>
            
            <p style="color: #555; background-color: #f9f9f9; padding: 10px; border-radius: 4px;">${introText}</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <tr>
                    <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; width: 30%;">Project / Task</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">${data.project}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Employee</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">
                        <strong>${data.empName || data.empId}</strong><br>
                        <span style="font-size: 12px; color: #777;">ID: ${data.empId} | Dept: ${data.empDept || '-'}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Destination</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">
                        <div style="font-weight: bold;">${data.station || '-'}</div>
                        <div style="font-size: 13px; color: #555;">${data.province || ''}</div>
                        ${data.gps ? `<a href="${mapLink}" style="color: #1a73e8; font-size: 12px;">📍 ${mapLabel}</a>` : ''}
                    </td>
                </tr>
                 <tr>
                    <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Details</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">
                        <div style="white-space: pre-wrap;">${data.details || '-'}</div>
                        <div style="font-size: 12px; color: #777; margin-top: 5px;">
                            Start: ${data.startDate ? Utilities.formatDate(new Date(data.startDate), Session.getScriptTimeZone(), "dd MMM HH:mm") : "-"}
                             ${data.deadline ? `<br>End: ${Utilities.formatDate(new Date(data.deadline), Session.getScriptTimeZone(), "dd MMM HH:mm")}` : ""}
                        </div>
                    </td>
                </tr>
            </table>

            <div style="margin-top: 25px; text-align: center;">
                <a href="${ScriptApp.getService().getUrl()}?page=trip-plan-report" 
                   style="background-color: ${headerColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                   Open System
                </a>
            </div>
            
            <div style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
                Automated Notification System
            </div>
        </div>
        `;
        
        // Define Recipients (N, N+1, N+2)
        var toEmail = "";
        var ccEmails = [];
        
        // 1. Employee (N) - TO recipient
        var empEmail = getEmployeeEmail(data.empId);
        toEmail = empEmail;
        
        // 2. Direct Manager (N+1) - CC
        var managerEmail = getManagerEmailForEmployee(data.empId);
        if (managerEmail) ccEmails.push(managerEmail);
        
        // 3. Manager's Manager (N+2) - CC
        var managersManagerEmail = getManagersManagerEmail(data.empId);
        if (managersManagerEmail) ccEmails.push(managersManagerEmail);
        
        // 4. Optional Additional (only for REQUEST) - CC
        if (type === 'REQUEST' && data.additionalEmail) {
            ccEmails.push(String(data.additionalEmail).trim());
        }
        
        var uniqueCC = [...new Set(ccEmails)];
        
        if (toEmail) {
            var emailOptions = {
                to: toEmail,
                subject: subject,
                htmlBody: htmlBody
            };
            
            if (uniqueCC.length > 0) {
                emailOptions.cc = uniqueCC.join(",");
            }
            
            MailApp.sendEmail(emailOptions);
            console.log("Email sent to:", toEmail, "CC:", uniqueCC, "Type:", type);
        } else {
             console.warn("No employee email found for trip plan.");
        }
        
    } catch(e) {
        console.error("sendTripPlanEmail Error: " + e);
    }
}

// Get all stores for searchable dropdown
function getAllStores() {
    try {
        var storeSheet = findStoreSheet();
        if (!storeSheet) {
            return JSON.stringify({ success: false, error: "Store database not found" });
        }
        
        var storeData = storeSheet.getDataRange().getValues();
        var stores = [];
        
        // Column 2 = Store ID, Column 4 = Site Name (Eng)
        for (var i = 1; i < storeData.length; i++) {
            var storeId = String(storeData[i][2]).trim();
            var siteName = String(storeData[i][4]).trim();
            
            if (storeId || siteName) {
                stores.push({
                    id: storeId,
                    name: siteName,
                    combined: storeId + (siteName ? " " + siteName : "")
                });
            }
        }
        
        return JSON.stringify({ success: true, stores: stores });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
}

// Helper function to find Store_Database sheet
function findStoreSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Store_Database");
    if (sheet) return sheet;
    
    // Also try "Store Data"
    sheet = ss.getSheetByName("Store Data");
    if (sheet) return sheet;

    // Fallback: Search for a sheet that looks like the Store DB
    var sheets = ss.getSheets();
    for(var i=0; i<sheets.length; i++) {
        var s = sheets[i];
        if(s.getLastRow() > 10 && s.getLastColumn() > 5) {
             var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
             var hStr = h.join(" ").toLowerCase();
             if(hStr.includes("store name") && hStr.includes("latitude")) {
                 return s;
             }
        }
    }
    return null;
}

function getStoreMapData() {
    try {
        // Open External Store Database
        var ss = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit");
        var storeSheet = ss.getSheets()[0]; // Assuming data is in the first sheet
        
        if (!storeSheet) return JSON.stringify({ error: "Store database sheet not found" });

        var data = storeSheet.getDataRange().getValues();
        var headers = data[0];
        
        var idIdx = -1, nameIdx = -1, latIdx = -1, longIdx = -1, provIdx = -1;
        var buIdx = -1, buTypeIdx = -1;

        for (var k = 0; k < headers.length; k++) {
            var h = String(headers[k]).trim().toLowerCase();
            if (h.includes("store name(th)")) nameIdx = k;
            else if (h.includes("store name") && nameIdx === -1) nameIdx = k;
            
            if (h.includes("gold text") || h.includes("site id") || h.includes("store id")) idIdx = k;
            
            if (h === "latitude" || h.includes("lat")) latIdx = k;
            if (h === "longitude" || h.includes("long")) longIdx = k;
            if (h.includes("province")) provIdx = k;
            
            if (h === "bu" || h === "business unit") buIdx = k;
            // Specific check for "BU Type (20)" or just "BU Type"
            if (h.includes("bu type")) buTypeIdx = k;
        }

        var stores = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var lat = (latIdx > -1) ? row[latIdx] : "";
            var long = (longIdx > -1) ? row[longIdx] : "";
            
            if (lat && long && !isNaN(lat) && !isNaN(long)) {
                stores.push({
                    id: (idIdx > -1) ? row[idIdx] : "",
                    name: (nameIdx > -1) ? row[nameIdx] : "Unknown Store",
                    lat: lat,
                    lng: long,
                    province: (provIdx > -1) ? row[provIdx] : "",
                    bu: (buIdx > -1) ? row[buIdx] : "",
                    buType: (buTypeIdx > -1) ? row[buTypeIdx] : ""
                });
            }
        }

        return JSON.stringify({ stores: stores });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// Helper to get start/end of a week
function getTripMapData(startStr, endStr) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return JSON.stringify({ error: "Trip_Plans sheet not found" });

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find indices
        var dateIdx = -1, stationIdx = -1, empIdIdx = -1, statusIdx = -1;
        for (var k = 0; k < headers.length; k++) {
            var h = String(headers[k]).trim().toLowerCase();
            if (h === "start date") dateIdx = k;
            if (h === "station") stationIdx = k;
            if (h === "employee id") empIdIdx = k;
            if (h === "status") statusIdx = k;
        }

        if (dateIdx === -1) return JSON.stringify({ error: "Start Date column not found" });

        // Parse Date Range
        var startDate = startStr ? new Date(startStr) : new Date();
        var endDate = endStr ? new Date(endStr) : new Date();
        
        // Adjust bounds
        startDate.setHours(0,0,0,0);
        endDate.setHours(23,59,59,999);

        // Load Store Data for GPS
        var storeData = loadStoreDatabase(); 
        var gpsMap = storeData.gpsMap;
        var nameMap = storeData.nameMap;

        // Load Employee Data for Names & Departments
        var empSheet = findEmployeeSheet();
        var empNameMap = {};
        var empDeptMap = {};
        
        if (empSheet) {
             var eData = empSheet.getDataRange().getValues();
             // Col Indicies: 1=ID, 2=Name, 13=Department (Index 13 is Col N)
             // Check headers if unsure, but assuming standard layout
             for(var j=1; j<eData.length; j++) {
                 var eid = String(eData[j][1]);
                 empNameMap[eid] = eData[j][2]; 
                 empDeptMap[eid] = eData[j][13]; 
             }
        }

        var trips = [];

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var dateVal = row[dateIdx];
            if (!dateVal) continue;

            var d = new Date(dateVal);
            
            // Date Filter
            if (d < startDate || d > endDate) continue;

            var status = (statusIdx > -1) ? row[statusIdx] : "Pending";
            if (String(status).toLowerCase().includes("reject")) continue; 

            var item = {
                stationKey: (stationIdx > -1) ? row[stationIdx] : "",
                empId: (empIdIdx > -1) ? row[empIdIdx] : "",
                date: Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"),
                status: status
            };
            
            // Enrich Name & Dept
            item.empName = empNameMap[item.empId] || item.empId;
            item.department = empDeptMap[item.empId] || "Other";

            // Enrich GPS
            var storeKey = item.stationKey ? String(item.stationKey).split(" ")[0] : ""; 
            var gps = gpsMap[item.stationKey] || gpsMap[storeKey];
            
            if (gps) {
                var parts = gps.split(",");
                item.lat = parts[0];
                item.lng = parts[1];
                item.storeName = nameMap[item.stationKey] || nameMap[storeKey] || item.stationKey;
                trips.push(item);
            }
        }

        return JSON.stringify({ trips: trips, count: trips.length });

    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// --- Check-in Feature ---

function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d * 1000; // Return in meters
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function getMyTodayTrips(empId) {
    try {
        var myEmpId = String(empId);
        
        if (!myEmpId) return JSON.stringify({ error: "Employee ID is missing." });

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (!sheet) return JSON.stringify({ error: "Trip_Plans sheet not found" });

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Indices
        var idIdx = -1, dateIdx = -1, stationIdx = -1, empIdIdx = -1, statusIdx = -1;
        var checkInTimeIdx = -1, checkInStatusIdx = -1;
        var abortTimeIdx = -1, abortCommentIdx = -1;

        for (var k = 0; k < headers.length; k++) {
            var h = String(headers[k]).trim().toLowerCase();
            if (h === "id") idIdx = k;
            if (h === "start date") dateIdx = k;
            if (h === "station") stationIdx = k;
            if (h === "employee id") empIdIdx = k;
            if (h === "status") statusIdx = k;
            if (h.includes("check in time")) checkInTimeIdx = k;
            if (h.includes("check in status")) checkInStatusIdx = k;
            if (h === "abort time") abortTimeIdx = k;
            if (h === "abort comment") abortCommentIdx = k;
        }

        var today = new Date();
        today.setHours(0,0,0,0);
        
        // Store GPS Map
        var storeData = loadStoreDatabase();
        var nameMap = storeData.nameMap;
        var gpsMap = storeData.gpsMap;

        var myTrips = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            
            // Check EmpID
            if (String(row[empIdIdx]) !== myEmpId) continue;
            
            // Check Date (Today)
            var d = new Date(row[dateIdx]);
            d.setHours(0,0,0,0);
            if (d.getTime() !== today.getTime()) continue;
            
            // Rejects?
            var status = (statusIdx > -1) ? row[statusIdx] : "";
            if (String(status).toLowerCase().includes("reject")) continue;

            var stationKey = row[stationIdx];
            var storeKey = stationKey ? String(stationKey).split(" ")[0] : "";
            var gps = gpsMap[stationKey] || gpsMap[storeKey] || "";
            
            myTrips.push({
                tripId: (idIdx > -1) ? row[idIdx] : "",
                storeName: nameMap[stationKey] || nameMap[storeKey] || stationKey,
                storeGps: gps,
                status: status,
                checkInTime: (checkInTimeIdx > -1) ? row[checkInTimeIdx] : "",
                checkInStatus: (checkInStatusIdx > -1) ? row[checkInStatusIdx] : "",
                abortTime: (abortTimeIdx > -1) ? row[abortTimeIdx] : "",
                abortComment: (abortCommentIdx > -1) ? row[abortCommentIdx] : ""
            });
        }
        
        return JSON.stringify({ trips: myTrips });

    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function saveCheckIn(tripId, lat, lng) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        var idIdx = -1, stationIdx = -1;
        
        // Dynamic Column Finding for Check-In Fields
        var map = {};
        for (var k = 0; k < headers.length; k++) {
            map[String(headers[k]).trim().toLowerCase()] = k;
        }
        
        idIdx = map["id"];
        stationIdx = map["station"];
        
        // Helper to find or create column
        function getColIndex(name) {
             if (map[name.toLowerCase()] !== undefined) return map[name.toLowerCase()];
             for (var key in map) {
                 if (key.includes(name.toLowerCase())) return map[key];
             }
             return -1;
        }

        var ciTimeIdx = getColIndex("Check In Time");
        var ciLatIdx = getColIndex("Check In Lat");
        var ciLngIdx = getColIndex("Check In Lng");
        var ciDistIdx = getColIndex("Check In Distance");
        var ciStatusIdx = getColIndex("Check In Status");

        // Auto-Add Columns if missing
        var lastCol = headers.length;
        if (ciTimeIdx === -1) { sheet.getRange(1, lastCol + 1).setValue("Check In Time"); ciTimeIdx = lastCol++; }
        if (ciLatIdx === -1) { sheet.getRange(1, lastCol + 1).setValue("Check In Lat"); ciLatIdx = lastCol++; }
        if (ciLngIdx === -1) { sheet.getRange(1, lastCol + 1).setValue("Check In Lng"); ciLngIdx = lastCol++; }
        if (ciDistIdx === -1) { sheet.getRange(1, lastCol + 1).setValue("Check In Distance"); ciDistIdx = lastCol++; }
        if (ciStatusIdx === -1) { sheet.getRange(1, lastCol + 1).setValue("Check In Status"); ciStatusIdx = lastCol++; }

        // Find Row
        var rowIndex = -1;
        var storeGps = "";
        
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][idIdx]) == String(tripId)) {
                rowIndex = i + 1;
                var stationKey = data[i][stationIdx];
                // Get Store GPS
                var storeData = loadStoreDatabase();
                var storeKey = stationKey ? String(stationKey).split(" ")[0] : "";
                storeGps = storeData.gpsMap[stationKey] || storeData.gpsMap[storeKey];
                break;
            }
        }
        
        if (rowIndex === -1) return JSON.stringify({ success: false, error: "Trip ID not found" });
        
        // Calculate Distance
        var distMeters = 0;
        var status = "Unknown";
        
        if (storeGps) {
            var parts = storeGps.split(",");
            var sLat = parseFloat(parts[0]);
            var sLng = parseFloat(parts[1]);
            
            distMeters = calculateDistance(sLat, sLng, lat, lng);
            
            if (distMeters <= 500) status = "Verified";
            else status = "Off-site (" + Math.round(distMeters) + "m)";
        } else {
            status = "No Store GPS";
        }
        
        var timestamp = new Date();
        
        // Update Sheet
        sheet.getRange(rowIndex, ciTimeIdx + 1).setValue(timestamp);
        sheet.getRange(rowIndex, ciLatIdx + 1).setValue(lat);
        sheet.getRange(rowIndex, ciLngIdx + 1).setValue(lng);
        sheet.getRange(rowIndex, ciDistIdx + 1).setValue(Math.round(distMeters) + "m");
        sheet.getRange(rowIndex, ciStatusIdx + 1).setValue(status);
        
        return JSON.stringify({ 
            success: true, 
            status: status, 
            distance: Math.round(distMeters) + "m",
            time: Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm")
        });

    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
}

// --- Abort Trip Plan Function ---
function abortTripPlan(tripId, empId, comment) {
    try {
        var _wlock = _acquireWriteLock_();
        Logger.log('Abort Trip Plan Request - TripID: ' + tripId + ', EmpID: ' + empId);
        
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var tripSheet = ss.getSheetByName('Trip_Plans');
        
        if (!tripSheet) {
            return JSON.stringify({ success: false, error: 'Trip_Plans sheet not found' });
        }
        
        var data = tripSheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find column indices using case-insensitive matching
        var idIdx = -1, empIdIdx = -1, statusIdx = -1, empNameIdx = -1;
        var storeIdx = -1, dateIdx = -1, stationIdx = -1;
        var abortCommentIdx = -1, abortTimeIdx = -1, checkInStatusIdx = -1;
        
        for (var k = 0; k < headers.length; k++) {
            var h = String(headers[k]).trim().toLowerCase();
            if (h === "id") idIdx = k;
            if (h === "employee id") empIdIdx = k;
            if (h === "status") statusIdx = k;
            if (h === "employee name") empNameIdx = k;
            if (h === "store") storeIdx = k;
            if (h === "station") stationIdx = k;
            if (h === "start date" || h === "date") dateIdx = k;
            if (h === "abort comment") abortCommentIdx = k;
            if (h === "abort time") abortTimeIdx = k;
            if (h.includes("check") && h.includes("status")) checkInStatusIdx = k;
        }
        
        // If abort columns don't exist, create them
        if (abortCommentIdx === -1) {
            abortCommentIdx = headers.length;
            tripSheet.getRange(1, abortCommentIdx + 1).setValue('Abort Comment');
        }
        if (abortTimeIdx === -1) {
            abortTimeIdx = headers.length;
            if (abortCommentIdx === abortTimeIdx) abortTimeIdx++;
            tripSheet.getRange(1, abortTimeIdx + 1).setValue('Abort Time');
        }
        // If Check In Status column doesn't exist, create it
        if (checkInStatusIdx === -1) {
            checkInStatusIdx = headers.length;
            if (abortCommentIdx === checkInStatusIdx) checkInStatusIdx++;
            if (abortTimeIdx === checkInStatusIdx) checkInStatusIdx++;
            tripSheet.getRange(1, checkInStatusIdx + 1).setValue('Check In Status');
        }
        
        Logger.log('Column indices - ID: ' + idIdx + ', EmpID: ' + empIdIdx + ', Status: ' + statusIdx);
        
        // Find the trip
        var rowIndex = -1;
        var tripData = null;
        
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][idIdx]) === String(tripId) && String(data[i][empIdIdx]) === String(empId)) {
                rowIndex = i + 1; // Sheet rows are 1-indexed
                tripData = data[i];
                break;
            }
        }
        
        Logger.log('Trip lookup - TripID: ' + tripId + ', EmpID: ' + empId + ', Found: ' + (rowIndex !== -1));
        
        if (rowIndex === -1) {
            return JSON.stringify({ success: false, error: 'Trip not found or unauthorized' });
        }
        
        // Check if already checked in
        if (checkInStatusIdx !== -1 && tripData[checkInStatusIdx] === 'Verified') {
            return JSON.stringify({ success: false, error: 'Cannot abort - already checked in' });
        }
        
        // Update trip status to Aborted
        if (statusIdx !== -1) {
            tripSheet.getRange(rowIndex, statusIdx + 1).setValue('Aborted');
        }
        tripSheet.getRange(rowIndex, abortCommentIdx + 1).setValue(comment);
        tripSheet.getRange(rowIndex, abortTimeIdx + 1).setValue(new Date());
        // Update Check In Status to Aborted
        if (checkInStatusIdx !== -1) {
            tripSheet.getRange(rowIndex, checkInStatusIdx + 1).setValue('Aborted');
        }
        
        // Get employee details for email
        var empSheet = findEmployeeSheet();
        var empData = empSheet.getDataRange().getValues();
        var empHeaders = empData[0];
        
        var empEmailIdx = empHeaders.indexOf('Email');
        var empFullNameIdx = empHeaders.indexOf('Full Name');
        var directManagerIdx = empHeaders.indexOf('Direct Manager');
        
        var employeeName = tripData[empNameIdx] || '';
        var managerEmail = '';
        var managerName = '';
        
        // Find employee's manager email
        for (var j = 1; j < empData.length; j++) {
            if (empEmailIdx !== -1 && empData[j][empEmailIdx]) {
                var rowEmpId = String(empData[j][0]).trim(); // Assuming Employee ID is first column
                if (rowEmpId === String(empId)) {
                    if (directManagerIdx !== -1) {
                        var managerNameRaw = empData[j][directManagerIdx];
                        managerName = managerNameRaw;
                        
                        // Find manager's email
                        for (var k = 1; k < empData.length; k++) {
                            if (empFullNameIdx !== -1 && empData[k][empFullNameIdx] === managerNameRaw) {
                                if (empEmailIdx !== -1) {
                                    managerEmail = empData[k][empEmailIdx];
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        // Send email to manager
        if (managerEmail) {
            var emailSubject = 'Work Trip Aborted - ' + tripId;
            var storeName = tripData[storeIdx] || 'N/A';
            var tripDate = tripData[dateIdx] ? Utilities.formatDate(new Date(tripData[dateIdx]), Session.getScriptTimeZone(), 'dd-MM-yyyy') : 'N/A';
            
            var emailBody = '<div style="font-family: Arial, sans-serif; padding: 20px;">';
            emailBody += '<h2 style="color: #d32f2f;">🚫 Work Trip Aborted</h2>';
            emailBody += '<p>A work trip has been aborted by an employee:</p>';
            emailBody += '<table style="border-collapse: collapse; margin: 20px 0;">';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Employee:</td><td style="padding: 8px; border: 1px solid #ddd;">' + employeeName + ' (ID: ' + empId + ')</td></tr>';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Trip ID:</td><td style="padding: 8px; border: 1px solid #ddd;">' + tripId + '</td></tr>';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Store:</td><td style="padding: 8px; border: 1px solid #ddd;">' + storeName + '</td></tr>';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date:</td><td style="padding: 8px; border: 1px solid #ddd;">' + tripDate + '</td></tr>';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Abort Reason:</td><td style="padding: 8px; border: 1px solid #ddd; background: #fff3cd;">' + comment + '</td></tr>';
            emailBody += '<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Abort Time:</td><td style="padding: 8px; border: 1px solid #ddd;">' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss') + '</td></tr>';
            emailBody += '</table>';
            emailBody += '<p style="color: #666; font-size: 12px;">This is an automated notification from the Trip Plan system.</p>';
            emailBody += '</div>';
            
            try {
                MailApp.sendEmail({
                    to: managerEmail,
                    subject: emailSubject,
                    htmlBody: emailBody
                });
                Logger.log('Abort email sent to: ' + managerEmail);
            } catch (emailError) {
                Logger.log('Email error: ' + emailError.toString());
                // Don't fail the abort if email fails
            }
        } else {
            Logger.log('No manager email found for employee: ' + empId);
        }
        
        return JSON.stringify({ 
            success: true, 
            message: 'Trip aborted successfully',
            tripId: tripId
        });
        
    } catch (e) {
        Logger.log('Error aborting trip: ' + e.toString());
        return JSON.stringify({ success: false, error: e.toString() });
    }
}


// --- Shared Store Data Access (List Version) ---

function getStoreDBDataForFrontend() {
    return getStoreDBDataV2();
}

function getStoreDBDataV2() {
    try {
        var cache = CacheService.getScriptCache();
        var listCacheKey = "STORE_DB_LIST_V9"; // bumped: now filters Status=A only
        var cached = cache.get(listCacheKey);
        
        if (cached) {
            // console.log("Serving Store DB List from Cache");
            return JSON.parse(cached);
        }
        
        console.log("Fetching Store DB Data List (Fresh)...");

        // Open Store Database (Using ID from TripPlan.gs)
        var ss = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit");
        var sheet = ss.getSheets()[0]; 
        
        if (!sheet) return [];

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Indices
        var idIdx = -1, nameIdx = -1, buIdx = -1, statusIdx = -1;
        var dmNameIdx = -1, dmEmailIdx = -1, cmNameIdx = -1, cmEmailIdx = -1, ammMtnIdx = -1;
        
        for (var i = 0; i < headers.length; i++) {
            var h = String(headers[i]).trim().toLowerCase();
            // Store Name (Eng) or just Store Name
            if (h.includes("store name") || h.includes("site name")) nameIdx = i;
            if (h === "bu" || h.includes("business unit") || h === "format") buIdx = i; 
            if (h.includes("store id") || h.includes("site id") || h === "code") idIdx = i;
            if (h === "status") statusIdx = i;

            // DM / CM Detection
            // DM Name - Priority: "DD Name (14)", then fallback to generic DM columns
            if (h === "dd name (14)" || h === "dd name 14" || h.includes("dd name")) {
                 dmNameIdx = i;
            } else if (dmNameIdx === -1 && (h === "dm" || h === "district manager" || (h.includes("district") && h.includes("name")))) {
                 dmNameIdx = i;
            }
            
            // DM Email - Priority: "e-mail DM BCM" or "e-mail DM column BCM"
            if (h.includes("e-mail dm") && h.includes("bcm")) {
                dmEmailIdx = i;
            } else if (dmEmailIdx === -1 && ((h.includes("district") || h.includes("dm")) && h.includes("email"))) {
                dmEmailIdx = i;
            }
            
            // CM Name - Keep existing logic (as user said "just like Cluster Manager")
            if (h === "cm" || h === "cluster manager" || h === "cm name (11)" || (h.includes("cluster") && h.includes("name"))) {
                 cmNameIdx = i;
            }
            
            // CM Email - Priority: "e-mail CM BCM" or "e-mail CM column BCM"
            if (h.includes("e-mail cm") && h.includes("bcm")) {
                cmEmailIdx = i;
            } else if (cmEmailIdx === -1 && (h.includes("sgm") || ((h.includes("cluster") || h.includes("cm")) && h.includes("email")))) {
                cmEmailIdx = i;
            }

            // AMM MTN - e.g. "AMM MTN (23)"
            if (h.includes("amm mtn") || h.includes("ammm mtn")) {
                ammMtnIdx = i;
            }
        }
        
        console.log("Indices Found - DM Name:", dmNameIdx, "CM Name:", cmNameIdx, "DM Email:", dmEmailIdx, "CM Email:", cmEmailIdx, "AMM MTN:", ammMtnIdx);
        
        // Return empty if name is missing
        if (nameIdx === -1) {
             console.warn("Store Name column not found");
             return [];
        }

        var result = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            // Filter: only Active stores (Status = "A")
            if (statusIdx > -1 && String(row[statusIdx]).trim().toUpperCase() !== "A") continue;
            var name = String(row[nameIdx]).trim();
            var bu = (buIdx > -1) ? String(row[buIdx]).trim() : "";
            var id = (idIdx > -1) ? String(row[idIdx]).trim() : "";
            
            if (name) {
                // Fallback: If ID is missing, try to extract from Name (Format: "Name-ID" or "Name - ID")
                if (!id && name.includes("-")) {
                    var lastDash = name.lastIndexOf("-");
                    var potentialId = name.substring(lastDash + 1).trim();
                    // Check if potential ID is numeric (at least 3 digits to be safe?) or just looks like an ID
                    if (/^\d+$/.test(potentialId)) {
                        id = potentialId;
                        name = name.substring(0, lastDash).trim();
                    }
                }

                // User requested "Store Code Store Name" format
                var displayName = name;
                if (id) {
                    displayName = id + " " + name;
                }
                
                result.push({
                    station: displayName,
                    bu: bu,
                    id: id,
                    dmName: (dmNameIdx > -1) ? String(row[dmNameIdx]).trim() : "",
                    dmEmail: (dmEmailIdx > -1) ? String(row[dmEmailIdx]).trim() : "",
                    cmName: (cmNameIdx > -1) ? String(row[cmNameIdx]).trim() : "",
                    cmEmail: (cmEmailIdx > -1) ? String(row[cmEmailIdx]).trim() : "",
                    ammMtn: (ammMtnIdx > -1) ? String(row[ammMtnIdx]).trim() : ""
                });
            }
        }
        
        // Cache for 6 hours
        try {
            cache.put(listCacheKey, JSON.stringify(result), 21600);
        } catch(e) { console.warn("Cache put failed"); }
        
        return result;
        
    } catch (e) {
        console.error("getStoreDBDataV2 Error: " + e.toString());
        return [];
    }
}

// Helper to get simple list of employees for system use (Validation/Mapping)
function getEmployeeList() {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Employee_Database");
        if (!sheet) {
             // Fallback to finding it
             sheet = findEmployeeSheet();
        }
        if (!sheet) return [];
        
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        var idIdx = -1; 
        var nameIdx = -1;
        var deptIdx = -1;
        
        for (var i = 0; i < headers.length; i++) {
            var h = String(headers[i]).trim().toLowerCase();
            if (h === "employee id" || h === "empid" || h === "id") idIdx = i;
            if (h === "full name" || h === "name") nameIdx = i;
            if (h === "department" || h === "dept") deptIdx = i;
        }
        
        if (idIdx === -1 || nameIdx === -1) {
             // Fallback hardcoded indices if not found (based on standard template)
             idIdx = 1; 
             nameIdx = 2;
        }
        
        var list = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (row[idIdx] && String(row[idIdx]).trim() !== "") {
                list.push({
                    id: String(row[idIdx]).trim(),
                    name: String(row[nameIdx]).trim(),
                    department: (deptIdx > -1) ? String(row[deptIdx]).trim() : ""
                });
            }
        }
        return list;
    } catch (e) {
        console.error("getEmployeeList error: " + e.toString());
        return [];
    }
}

// Get all trip plans for calendar view
function getAllTripPlansForCalendar(clientEmail) {
    try {
        console.log("getAllTripPlansForCalendar: Starting...");
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var dbAdminCheck = checkAdminStatus(userEmail);
        var isAdmin = dbAdminCheck.isAdmin;
        
        // Reuse the logic from getAllTripPlansReport by calling it directly if possible, 
        // OR duplicate the logic to ensure we get the exactly same enriched data.
        // Since getAllTripPlansReport returns a JSON string, we can parse it.
        
        var reportJson = getAllTripPlansReport(userEmail);
        var reportData = JSON.parse(reportJson);
        
        // The calendar expects { trips: [], isAdmin: ... }
        // The report returns { orders: [], isAdmin: ... }
        // We just need to map 'orders' to 'trips' and ensure the structure is compatible.
        
        return {
            trips: reportData.orders || [],
            isAdmin: reportData.isAdmin,
            user: userEmail
        };

    } catch (e) {
        return { trips: [], isAdmin: false, error: e.toString() };
    }
}

// --- Trip Comments Feature (Consolidated) ---

// Debug Function
function getTripCommentsDebug(tripId) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("Trip_Comments");
        if (!sheet) return { error: "Sheet missing" };
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var rows = data.slice(1, 6).map(r => r.slice(0, 5)); // First 5 rows, first 5 cols
        return {
            headers: headers,
            sampleRows: rows,
            tripIdSearched: tripId,
            totalRows: data.length
        };
    } catch (e) {
        return { error: e.toString() };
    }
}

function getTripComments(tripId) {
  try {
    // --- DEBUG TUNNEL ---
    if (typeof tripId === 'string' && tripId.startsWith('DEBUG:')) {
        const actualId = tripId.replace('DEBUG:', '');
        
        // LOGGING TO SHEET TO PROVE EXECUTION
        try {
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var logSheet = ss.getSheetByName("Debug_Log");
            if (!logSheet) {
                logSheet = ss.insertSheet("Debug_Log");
                logSheet.appendRow(["Timestamp", "TripID", "Action"]);
            }
            logSheet.appendRow([new Date(), actualId, "Debug Tunnel Accessed"]);
        } catch(e) { /* ignore logging errors */ }

        var result = getTripCommentsDebug(actualId);
        
        // Log result content
        try {
             var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Debug_Log");
             if(logSheet) {
                 logSheet.appendRow([new Date(), actualId, "Result Payload: " + JSON.stringify(result)]);
             }
        } catch(e) {}

        return result;
    }
    // --------------------

    console.log("getTripComments called for:", tripId);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Trip_Comments");
    if (!sheet) {
        console.warn("Trip_Comments sheet missing");
        return [];
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Header only or empty

    var headers = data[0];
    var idIdx = -1, timeIdx = -1, userIdx = -1, commIdx = -1, fileIdx = -1, nameIdx = -1;

    // Robust Header Matching
    var normalize = function(s) { return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, ""); };

    for (var h = 0; h < headers.length; h++) {
        var header = normalize(headers[h]);
        if (header === "tripid" || header === "id") idIdx = h;
        if (header === "timestamp" || header === "date" || header === "time") timeIdx = h;
        if (header === "useremail" || header === "email" || header === "user") userIdx = h;
        if (header === "comment" || header === "comments" || header === "message") commIdx = h;
        if (header === "fileurl" || header === "url" || header === "attachment" || header === "file") fileIdx = h;
        if (header === "filename" || header === "name") nameIdx = h;
    }

    // --- LOG MATCHING DEBUG ---
    try {
         var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Debug_Log");
         if(logSheet) {
             const headLog = `Indices: ID=${idIdx}, Time=${timeIdx}, Comment=${commIdx}`;
             logSheet.appendRow([new Date(), tripId, headLog]);
             
             // Log first 3 comparisons
             for(var k=1; k<Math.min(data.length, 4); k++) {
                 const rowId = String(data[k][idIdx]).trim();
                 const match = (rowId === String(tripId).trim());
                 logSheet.appendRow([new Date(), tripId, `Row ${k}: '${rowId}' vs '${tripId}' => ${match}`]);
             }
         }
    } catch(e) {}
    // --------------------------
    
    if (idIdx === -1) {
        console.warn("TripID column not found in Trip_Comments");
        return [];
    }
    
    // Debug Logging for specific trip
    console.log("Looking for tripId:", tripId);
    console.log("Headers found indices:", {id: idIdx, time: timeIdx, user: userIdx, comm: commIdx});
    
    var comments = [];
    for (var i = 1; i < data.length; i++) {
        var rowId = String(data[i][idIdx]).trim();
        if (rowId === String(tripId).trim()) {
            comments.push({
                timestamp: data[i][timeIdx],
                user: (userIdx > -1) ? data[i][userIdx] : "",
                text: (commIdx > -1) ? data[i][commIdx] : "",
                fileUrl: (fileIdx > -1) ? data[i][fileIdx] : "",
                fileName: (nameIdx > -1) ? data[i][nameIdx] : ""
            });
        }
    }
    
    // Sort by timestamp descending (newest first)
    try {
        comments.sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    } catch (sortErr) {
        // Log sort error
         try {
             var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Debug_Log");
             if(logSheet) logSheet.appendRow([new Date(), tripId, "Sort Error: " + sortErr.toString()]);
        } catch(e) {}
    }

    // LOG SUCCESS
    try {
         var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Debug_Log");
         if(logSheet) logSheet.appendRow([new Date(), tripId, "Returning " + comments.length + " comments"]);
    } catch(e) {}

    console.log("Found " + comments.length + " comments for trip " + tripId);
    
    // SANITIZE RETURN DATA (Fix Serialization Issues)
    var safeComments = comments.map(function(c) {
        return {
            timestamp: c.timestamp ? new Date(c.timestamp).toISOString() : "",
            user: String(c.user || ""),
            text: String(c.text || ""),
            fileUrl: String(c.fileUrl || ""),
            fileName: String(c.fileName || "")
        };
    });
    
    return safeComments;
  } catch (e) {
      // LOG ERROR
      try {
             var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Debug_Log");
             if(logSheet) logSheet.appendRow([new Date(), tripId, "CRITICAL ERROR: " + e.toString()]);
      } catch(logE) {}

      console.error("getTripComments Error", e);
      return [];
  }
}

function uploadTripAttachment(fileData) {
    try {
        if (!fileData || !fileData.data || !fileData.name) {
            return { error: "Invalid file data" };
        }
        
        var folderName = "Trip_Comments_Assets";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        
        if (folders.hasNext()) {
            folder = folders.next();
        } else {
            folder = DriveApp.createFolder(folderName);
            folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        }
        
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        var fileUrl = "";
        if (fileData.mimeType.indexOf("image") > -1) {
             fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
        } else {
             fileUrl = file.getUrl();
        }
        
        return { success: true, url: fileUrl, name: fileData.name };

    } catch (e) {
        console.error("uploadTripAttachment Error", e);
        return { success: false, error: e.toString() };
    }
}

function addTripComment(tripId, commentText, filesData, userEmail, userName) {
  try {
    var _wlock = _acquireWriteLock_();
    console.log("addTripComment:", tripId, userEmail);
    // --- Permission Check ---
    if (!canUserComment(tripId, userEmail)) {
        console.warn("Permission denied for comment");
        return { success: false, error: "Permission Denied: You cannot comment on this trip." };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Trip_Comments");
    
    if (!sheet) {
        sheet = ss.insertSheet("Trip_Comments");
        sheet.appendRow(["TripID", "Timestamp", "UserEmail", "Comment", "FileUrl", "FileName"]);
    }
    
    var fileUrls = [];
    var fileNames = [];
    
    // Normalize input to array
    var files = [];
    if (Array.isArray(filesData)) {
        files = filesData;
    } else if (filesData && (filesData.data || filesData.url)) { // Accept data OR url
        files = [filesData];
    }
    
    if (files.length > 0) {
        try {
            var folderName = "Trip_Comments_Assets";
            var folder = null; 
            
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                
                // Case 1: Pre-uploaded (has URL)
                if (f.url) {
                    fileUrls.push(f.url);
                    fileNames.push(f.name);
                    continue;
                }
                
                // Case 2: Raw Data (Legacy/fallback for small files)
                if (f.data) {
                    if (!folder) {
                         var folders = DriveApp.getFoldersByName(folderName);
                         folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
                         folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    }
                    
                    var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType, f.name);
                    var file = folder.createFile(blob);
                    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    
                    if (f.mimeType.indexOf("image") > -1) {
                         fileUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    } else {
                         fileUrls.push(file.getUrl());
                    }
                    fileNames.push(f.name);
                }
            }
            
        } catch (e) {
            console.error("File Upload Error", e);
            return { success: false, error: "File Upload Failed: " + e.toString() };
        }
    }
    
    sheet.appendRow([
        tripId, 
        new Date(), 
        userEmail, 
        commentText, 
        fileUrls.join('\n'), 
        fileNames.join('\n')
    ]);

    try {
        sendCommentEmail(tripId, commentText, userEmail, fileNames.join('\n'), fileUrls.join('\n'), userName);
    } catch (mailErr) {
        console.error("Email Notification Failed", mailErr);
    }
    
    return { success: true };
    
  } catch (e) {
      console.error("addTripComment Error", e);
      return { success: false, error: e.toString() };
  }
}

function canUserComment(tripId, userEmail) {
    try {
        var dbAdminCheck = checkAdminStatus(userEmail);
        if (dbAdminCheck.isAdmin) return true;

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("Trip_Plans");
        if (!sheet) return false;

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idIdx = -1, empIdIdx = -1;
        
        for (var k = 0; k < headers.length; k++) {
            var h = String(headers[k]).trim().toLowerCase();
            if (h === "id") idIdx = k;
            if (h === "employee id") empIdIdx = k;
        }
        
        if (idIdx === -1) return false;
        
        var empId = null;
        for (var i = 1; i < data.length; i++) {
             if (String(data[i][idIdx]) === String(tripId)) {
                 empId = (empIdIdx > -1) ? data[i][empIdIdx] : null;
                 break;
             }
        }
        
        if (!empId) return false; 
        
        var ownerEmail = getEmployeeEmail(empId);
        if (ownerEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase()) return true;
        
        var managerEmail = getManagerEmailForEmployee(empId);
        if (managerEmail && userEmail.toLowerCase() === managerEmail.toLowerCase()) return true;
        
        var managersManagerEmail = getManagersManagerEmail(empId);
        if (managersManagerEmail && userEmail.toLowerCase() === managersManagerEmail.toLowerCase()) return true;
        
        return false;
    } catch(e) {
        console.error("Permission Check Failure:", e);
        return false;
    }
}

function sendCommentEmail(tripId, comment, authorEmail, fileNamesStr, fileUrlsStr, authorName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tripSheet = ss.getSheetByName('Trip_Plans');
    if (!tripSheet) return;

    var data = tripSheet.getDataRange().getValues();
    var headers = data[0];
    
    // Header Mapping
    var map = {};
    for (var k = 0; k < headers.length; k++) {
        map[String(headers[k]).trim().toLowerCase()] = k;
    }
    
    var getCol = function(name) { return map[name] !== undefined ? map[name] : -1; };
    var idIdx = getCol("id");
    
    if (idIdx === -1) return;

    var tripRow = null;
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][idIdx]) === String(tripId)) {
            tripRow = data[i];
            break;
        }
    }
    
    if (!tripRow) return;

    // Helper to get value
    var val = function(key) { 
        var idx = getCol(key.toLowerCase());
        return (idx > -1) ? tripRow[idx] : ""; 
    };

    var empId = val("employee id");
    var project = val("project/task") || val("project");
    var station = val("station") || val("store");
    var details = val("details");
    var startDate = val("start date");
    var deadline = val("deadline") || val("finish date");
    var status = val("status");

    // Formatting Dates
    var formatDate = function(d) {
        return (d && d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd MMM yyyy HH:mm") : d;
    };

    var ownerEmail = getEmployeeEmail(empId);
    var managerEmail = getManagerEmailForEmployee(empId);
    
    var to = [];
    var cc = [];
    
    if (authorEmail && ownerEmail && authorEmail.toLowerCase() === ownerEmail.toLowerCase()) {
        if (managerEmail) to.push(managerEmail);
    } else {
        if (ownerEmail) to.push(ownerEmail);
        if (managerEmail) cc.push(managerEmail);
    }
    
    if (to.length === 0 && cc.length === 0) {
        console.warn("No recipients for comment email");
        return;
    }
    
    var subject = "New Comment on Trip: " + project + " (" + tripId + ")";
    
    // Process Attachments
    var fileNames = (fileNamesStr || "").split('\n');
    var fileUrls = (fileUrlsStr || "").split('\n');
    
    var attachmentsHtml = "";
    if (fileUrls.length > 0 && fileUrls[0]) {
        attachmentsHtml = '<div style="margin-bottom: 20px;"><strong>Attachments:</strong><ul style="padding-left: 20px; margin-top: 5px;">';
        for(var i=0; i<fileUrls.length; i++) {
            if(!fileUrls[i]) continue;
            var name = fileNames[i] || "Attachment " + (i+1);
            attachmentsHtml += '<li style="margin-bottom: 5px;"><a href="' + fileUrls[i] + '" style="color: #1a73e8; text-decoration: none;">📎 ' + name + '</a></li>';
        }
        attachmentsHtml += '</ul></div>';
    }
    
    // Rich Email Body
    var htmlBody = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <div style="background-color: #1a73e8; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0; font-size: 18px;">New Comment on Trip Plan</h2>
            </div>
            
            <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; background-color: #ffffff;">
                
                <p style="margin-top: 0;"><strong>${authorName || authorEmail}</strong> commented:</p>
                
                <div style="background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 15px; margin: 15px 0; font-style: italic;">
                    "${comment || "(No text content)"}"
                </div>

                ${attachmentsHtml}

                <div style="border-top: 1px solid #eee; margin-top: 20px; padding-top: 15px; font-size: 14px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #555;">Trip Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #777; width: 120px;">Work Type:</td>
                            <td style="padding: 5px 0; font-weight: bold; color: #1a73e8;">${val("work type") || val("type") || "-"}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">ID:</td>
                            <td style="padding: 5px 0; font-weight: bold;">${tripId}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">Project:</td>
                            <td style="padding: 5px 0;">${project}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">Status:</td>
                            <td style="padding: 5px 0;">
                                <span style="background-color: #e8f0fe; color: #1a73e8; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${status}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">Station:</td>
                            <td style="padding: 5px 0;">${station}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">Date:</td>
                            <td style="padding: 5px 0;">${formatDate(startDate)} - ${formatDate(deadline)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #777;">Details:</td>
                            <td style="padding: 5px 0;">${details}</td>
                        </tr>
                    </table>
                </div>

                <div style="margin-top: 25px; text-align: center;">
                    <a href="${ScriptApp.getService().getUrl()}?page=trip-plan-calendar" 
                       style="display: inline-block; background-color: #1a73e8; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold;">
                       View on Calendar
                    </a>
                </div>
            </div>
            <div style="text-align: center; color: #999; font-size: 12px; margin-top: 10px;">
                Automated Notification System
            </div>
        </div>
    `;
    
    MailApp.sendEmail({
        to: to.join(","),
        cc: cc.join(","),
        subject: subject,
        htmlBody: htmlBody
    });
}
