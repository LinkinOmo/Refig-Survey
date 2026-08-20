var ADMIN_EMAILS = ['barramee.mahayossanunt@gmail.com']; // Add other admins if needed

// Helper to find the Safety Sheet (handles spaces vs underscores)
function findSafetySheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Safety_Incident_Database");
    if (sheet) return sheet;

    // Fallback
    sheet = ss.getSheetByName("Safety Incident Database");
    if (sheet) return sheet;

    return null;
}

function processSafetyIncidentForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = findSafetySheet();
        var headers = [
            "Timestamp", "ID", "Recorder ID", "Station", 
            "Incident Date", "Incident Time", 
            "Incident Type", "Severity", 
            "Description", "Immediate Action",
            "Status", "Acknowledged By", "Acknowledge Date",
            "Follow-up Notes", "Follow-up Date", "Follow-up By",
            "Attachments_JSON"
        ];
        
        if (!sheet) {
            // Create if missing (default to underscore version)
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Safety_Incident_Database");
            sheet.appendRow(headers);
        } else if (sheet.getLastRow() === 0) {
            sheet.appendRow(headers);
        }

        var id = "SI-" + new Date().getTime(); 
        
        // Handle Attachments
        var attachmentLinks = [];
        if (form.attachments && form.attachments.length > 0) {
            var folderName = "Safety_Incident_Attachments";
            var folder;
            var folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(folderName); }
            
            form.attachments.forEach(function(att) {
                if (att.data) {
                    var filename = id + "_" + att.name;
                    var blob = Utilities.newBlob(Utilities.base64Decode(att.data), att.mimeType, filename);
                    var file = folder.createFile(blob);
                    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    attachmentLinks.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                }
            });
        }

        var row = [
            new Date(),
            id,
            form.empId,
            form.station,
            form.date,
            form.time,
            form.type,
            form.severity,
            form.description,
            form.action,
            "Pending", "", "", // Status, Ack By, Ack Date
            "", "", "", // Follow-up
            JSON.stringify(attachmentLinks)
        ];

        sheet.appendRow(row);
        
        // --- EMAIL NOTIFICATION ---
        try {
            var toEmail = "";
            var ccEmails = [];
            
            // 1. Recorder (Reporter) - TO
            var recorderEmail = getEmployeeEmail(form.empId);
            toEmail = recorderEmail;
            
            // 2. Managers (N+1, N+2) - CC
            var managerEmail = getManagerEmailForEmployee(form.empId);
            if (managerEmail) ccEmails.push(managerEmail);
            
            var managersManagerEmail = getManagersManagerEmail(form.empId);
            if (managersManagerEmail) ccEmails.push(managersManagerEmail);
            
            // 3. Admins (Safety Officers) - CC
            if (ADMIN_EMAILS && ADMIN_EMAILS.length > 0) {
                ccEmails = ccEmails.concat(ADMIN_EMAILS);
            }

            var uniqueCC = [...new Set(ccEmails)];

            if (toEmail) {
                var subject = "[URGENT] Safety Incident Reported: " + form.station + " - " + form.type;
                var htmlBody = `
                    <h2>Safety Incident Report</h2>
                    <p><b>Station:</b> ${form.station}</p>
                    <p><b>Date/Time:</b> ${form.date} ${form.time}</p>
                    <p><b>Type:</b> ${form.type}</p>
                    <p><b>Severity:</b> ${form.severity}</p>
                    <p><b>Description:</b><form.description}</p>
                    <p><b>Immediate Action:</b><br>${form.action}</p>
                    <p><b>Reported By:</b> ${form.empId}</p>
                    <p><a href="${ScriptApp.getService().getUrl()}?page=safety-incident-report">View Report</a></p>
                `;
                
                var emailOptions = {
                    to: toEmail,
                    subject: subject,
                    htmlBody: htmlBody
                };
                
                if (uniqueCC.length > 0) {
                    emailOptions.cc = uniqueCC.join(",");
                }
                
                sendAppEmail_(emailOptions);
            }
        } catch (e) {
            console.error("Email error: " + e);
        }

        return { success: true, message: "Incident reported successfully." };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getSafetyIncidentsReport_v2() {
    var logs = [];
    logs.push("Function started");
    try {
        // Cache 60s — full safety-incident + Employee_Database scan on every call,
        // fired on every report load and after every update.
        var _sirCache = CacheService.getScriptCache();
        var _sirHit = _sirCache.get('SAFETY_INCIDENTS_V1');
        if (_sirHit) return _sirHit;

        var sheet = findSafetySheet();
        
        // --- Debug Info Collecting ---
        var debug = {
            sheetFound: false,
            sheetName: "",
            rowCount: 0,
            availableSheets: []
        };
        
        if (!sheet) {
             logs.push("Sheet not found");
             var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
             debug.availableSheets = sheets.map(function(s) { return s.getName(); });
             debug.activeSpreadsheetName = SpreadsheetApp.getActiveSpreadsheet().getName();
             return JSON.stringify({ orders: [], debug: debug, logs: logs }); 
        }

        debug.sheetFound = true;
        debug.sheetName = sheet.getName();
        logs.push("Sheet found: " + sheet.getName());
        
        var data = sheet.getDataRange().getValues();
        debug.rowCount = data.length;
        logs.push("Row count: " + data.length);
        
        if (data.length <= 1) {
            logs.push("Empty data (headers only or less)");
            return JSON.stringify({ orders: [], debug: debug, logs: logs }); 
        }
        
        var headers = data[0];
        debug.headers = headers;
        
        var h = {};
        for (var c = 0; c < headers.length; c++) h[String(headers[c]).trim().toLowerCase()] = c;
        
        var results = [];
        
        // Helper to resolve employee name
        var empMap = {};
        try {
            var empSheet = findEmployeeSheet(); 
            if (empSheet) {
                var empData = empSheet.getDataRange().getValues();
                for(var j=1; j<empData.length; j++) {
                    if(empData[j][1]) empMap[String(empData[j][1])] = empData[j][2];
                }
            }
        } catch(e) { 
            logs.push("Emp lookup warning: " + e.toString());
        }

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var getVal = function(k) { 
                var key = k.toLowerCase();
                return (h[key] !== undefined && h[key] < row.length) ? row[h[key]] : ""; 
            };
            
            var attachments = [];
            try {
                var json = getVal("Attachments_JSON");
                if (json) attachments = JSON.parse(json);
            } catch(e) {}

            var incident = {
                id: getVal("ID"),
                timestamp: getVal("Timestamp"),
                recorderId: getVal("Recorder ID"), 
                recorderName: empMap[getVal("Recorder ID")] || getVal("Recorder ID"),
                station: getVal("Station"),
                date: getVal("Incident Date"),
                time: getVal("Incident Time"),
                type: getVal("Incident Type"),
                severity: getVal("Severity"),
                description: getVal("Description"),
                action: getVal("Immediate Action"),
                status: getVal("Status"),
                followup: {
                    notes: getVal("Follow-up Notes")
                },
                attachments: attachments
            };
            
            // Format Date
            try {
                 if (incident.date) incident.date = Utilities.formatDate(new Date(incident.date), Session.getScriptTimeZone(), "yyyy-MM-dd");
                 if (incident.timestamp) incident.timestamp = Utilities.formatDate(new Date(incident.timestamp), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
            } catch(e) {}

            results.push(incident);
        }
        
        logs.push("Processed results: " + results.length);
        var _sirJson = JSON.stringify({ orders: results.reverse(), debug: debug, logs: logs });
        try { _sirCache.put('SAFETY_INCIDENTS_V1', _sirJson, 60); } catch (e) {}
        return _sirJson;

    } catch (e) {
        logs.push("ERROR: " + e.toString());
        return JSON.stringify({ error: e.toString(), logs: logs });
    }
}

function updateSafetyIncident(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = findSafetySheet();
        if (!sheet) return { success: false, error: "Database sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        var h = {};
        for(var c=0; c<headers.length; c++) h[String(headers[c]).trim().toLowerCase()] = c + 1; // 1-based

        var rowIndex = -1;
        var idCol = (h["id"] || h["ID"]) - 1; // 0-based
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][idCol] == form.id) {
                rowIndex = i + 1;
                break;
            }
        }

        if (rowIndex > 0) {
            if (form.status && h["status"]) sheet.getRange(rowIndex, h["status"]).setValue(form.status);
            if (form.notes && h["follow-up notes"]) sheet.getRange(rowIndex, h["follow-up notes"]).setValue(form.notes);
            
            // Update metadata
            var user = Session.getActiveUser().getEmail();
            if (h["follow-up by"]) sheet.getRange(rowIndex, h["follow-up by"]).setValue(user);
            if (h["follow-up date"]) sheet.getRange(rowIndex, h["follow-up date"]).setValue(new Date());

            return { success: true };
        }
        return { success: false, error: "Incident not found" };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Helper functions for email
function getEmployeeEmail(empId) {
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        
        for (var i = 1; i < data.length; i++) {
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

function getManagerEmailForEmployee(empId) {
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        
        // 1. Find the Employee's Manager Name
        var managerName = "";
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][1]).trim() === String(empId).trim()) { // Col 1 is EmpID
                managerName = data[i][4]; // Col 4 is Manager Name
                break;
            }
        }
        
        if (!managerName) return null;
        
        // 2. Find Manager's Email by Name
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][2]).trim().toLowerCase() === String(managerName).trim().toLowerCase()) { // Col 2 is Name
                return data[i][6]; // Col 6 is Email
            }
        }
        
        return null;
    } catch (e) {
        console.warn("getManagerEmailForEmployee Error: " + e.toString());
        return null;
    }
}

function getManagersManagerEmail(empId) {
    try {
        var sheet = findEmployeeSheet();
        if (!sheet) return null;
        
        var data = sheet.getDataRange().getValues();
        
        // First, find the employee's direct manager (n+1)
        var directManagerName = null;
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][1]).trim() === String(empId).trim()) { // Col 1 is Employee ID
                directManagerName = data[i][4]; // Col 4 is Direct Manager
                break;
            }
        }
        
        if (!directManagerName) return null;
        
        // Now find the direct manager's manager (n+2)
        for (var i = 1; i < data.length; i++) {
            if (data[i][2] && String(data[i][2]).trim().toLowerCase() === String(directManagerName).trim().toLowerCase()) { // Col 2 is Full Name
                var managersManagerName = data[i][4]; // This manager's Direct Manager
                if (!managersManagerName) return null;
                
                // Find the email of n+2
                for (var j = 1; j < data.length; j++) {
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

function findEmployeeSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Employee_Database");
    if (sheet) return sheet;

    // Fallback
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        var headers = s.getRange(1, 1, 1, 15).getValues()[0];
        if (headers.indexOf("Direct Manager") !== -1 || headers.indexOf("Full Name") !== -1) {
            return s;
        }
    }
    
    Logger.log("Could not identify Employee Sheet.");
    return ss.getSheets()[0];
}
