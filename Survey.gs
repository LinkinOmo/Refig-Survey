
// --- Site Visit Report Feature ---

// Helper Functions (needed by getAllSurveysReport)
function findEmployeeSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Employee_Database");
    if (sheet) return sheet;

    // Fallback: Search for a sheet that looks like the Employee DB
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        var headers = s.getRange(1, 1, 1, 15).getValues()[0];
        if (headers.indexOf("Direct Manager") !== -1 || headers.indexOf("Full Name") !== -1) {
             return s;
        }
    }
    
    // Last resort: Return first sheet
    Logger.log("Could not identify Employee Sheet. Using first sheet.");
    return ss.getSheets()[0];
}

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


function checkSurveyAdminStatus(clientEmail) {
    var email = clientEmail || Session.getActiveUser().getEmail();
    var isAdmin = false;
    var isSMF = false;
    var isScheduleAdmin = false;

    // ── 2-minute per-user script cache to avoid re-reading Employee_Database every call ──
    try {
        var _uc = CacheService.getScriptCache();
        var _uk = 'AUTH_FLAGS_' + (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
        var _uv = _uc.get(_uk);
        if (_uv) {
            var _uf = JSON.parse(_uv);
            return { isAdmin: _uf.isAdmin, isSMF: _uf.isSMF, isScheduleAdmin: _uf.isScheduleAdmin, email: email };
        }
    } catch(_uce) {}
    // ─────────────────────────────────────────────────────────────────────
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find column indices dynamically; fall back to known defaults
        var emailIdx = 6, userTypeIdx = 14, noteIdx = -1;
        for (var h = 0; h < headers.length; h++) {
            var hdr = String(headers[h]).trim().toLowerCase();
            if (hdr === "email") emailIdx = h;
            if (hdr === "user type" || hdr === "role" || hdr === "usertype") userTypeIdx = h;
            if (hdr === "note" || hdr === "notes") noteIdx = h;
        }
        
        // Scan rows
        for (var i = 1; i < data.length; i++) {
            var rowEmail = data[i][emailIdx];
            if (rowEmail && email && rowEmail.toString().trim().toLowerCase() === email.toString().trim().toLowerCase()) {
                var userType = data[i][userTypeIdx];
                if (userType) {
                    var role = userType.toString().trim().toLowerCase();
                    if (role === 'admin') {
                        isAdmin = true;
                    } else if (role === 'survey_admin' || role === 'schedule_admin' ||
                               role === 'surveyadmin'  || role === 'scheduleadmin') {
                        isScheduleAdmin = true;
                    }
                }
                if (noteIdx > -1) {
                    var teamNote = String(data[i][noteIdx]).trim().toUpperCase();
                    if (teamNote === 'SMF') isSMF = true;
                }
                break;
            }
        }
    } catch (e) {
        Logger.log("Error checking admin status: " + e);
    }

    // If SMF Admin toggle is enabled globally, elevate SMF users to Admin level
    if (isSMF && !isAdmin) {
        try {
            var smfFlag = PropertiesService.getScriptProperties().getProperty('SMF_ADMIN_ENABLED');
            if (smfFlag === 'true') isAdmin = true;
        } catch(e) {}
    }

    // Store result in 2-minute cache
    try {
        var _uc2 = CacheService.getScriptCache();
        var _uk2 = 'AUTH_FLAGS_' + (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
        _uc2.put(_uk2, JSON.stringify({ isAdmin: isAdmin, isSMF: isSMF, isScheduleAdmin: isScheduleAdmin }), 120);
    } catch(_uce2) {}

    return { isAdmin: isAdmin, isSMF: isSMF, isScheduleAdmin: isScheduleAdmin, email: email };
}

// Called by the frontend after page load to get the real flags for the logged-in user.
// Session.getActiveUser() is unreliable in web app context, so the frontend passes
// the email it has in localStorage.
function getUserFlags(clientEmail) {
    return checkSurveyAdminStatus(clientEmail);
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
        Logger.log("getEmployeeEmail Error: " + e.toString());
        return null;
    }
}

function getManagerChain(reporterId, reporterEmail) {
    var emails = [];
    if (reporterEmail) emails.push(reporterEmail); // N (Reporter)

    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        var idCol = -1, nameCol = -1, emailCol = -1, managerCol = -1;
        
        // Find columns
        for (var h = 0; h < headers.length; h++) {
            var header = String(headers[h]).trim().toLowerCase();
            if (header === "employee id" || header === "emp id") idCol = h;
            if (header === "full name" || header === "name") nameCol = h;
            if (header === "email") emailCol = h;
            if (header === "direct manager" || header === "manager") managerCol = h;
        }

        if (nameCol === -1 || managerCol === -1 || emailCol === -1) {
            Logger.log("Missing required columns for manager lookup.");
            return emails;
        }

        // Build Map: Name -> {Email, ManagerName} (Using Name as key because Manager reference is likely by Name)
        // Also ID -> {Name, Email, ManagerName}
        var empMap = {};
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var name = String(row[nameCol]).trim();
            if (name) {
                empMap[name.toLowerCase()] = {
                    email: row[emailCol],
                    manager: row[managerCol] ? String(row[managerCol]).trim() : "",
                    name: name
                };
            }
            // If we have ID column, map ID too (useful for finding N)
            if (idCol !== -1) {
                var eid = String(row[idCol]).trim();
                if (eid) {
                     empMap["ID_" + eid] = {
                        name: name,
                        email: row[emailCol],
                        manager: row[managerCol] ? String(row[managerCol]).trim() : ""
                    };
                }
            }
        }

        // Find N (Reporter)
        var reporter = empMap["ID_" + reporterId];
        // If not found by ID, try finding by Email (reverse lookup not efficient but maybe reporterId is missing)
        
        var currentManagerName = "";
        
        if (reporter) {
             currentManagerName = reporter.manager;
        } else {
             Logger.log("Reporter ID not found in DB: " + reporterId);
             return emails; 
        }

        // Find N+1
        if (currentManagerName) {
            var n1 = empMap[currentManagerName.toLowerCase()];
            if (n1 && n1.email) {
                emails.push(n1.email);
                currentManagerName = n1.manager; // Prepare for N+2
                
                // Find N+2
                if (currentManagerName) {
                    var n2 = empMap[currentManagerName.toLowerCase()];
                    if (n2 && n2.email) {
                        emails.push(n2.email);
                    }
                }
            }
        }

    } catch (e) {
        Logger.log("Error in getManagerChain: " + e);
    }
    return emails;
}


function generateEmailBody(form, attachmentLinks, quantities) {
    var html = '<html><body style="font-family: sans-serif; color: #333; margin: 0; padding: 0; background-color: #f4f4f4;">';
    
    // Main Container
    html += '<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 16px; line-height: 1.5;">';

    // Header
    html += '<div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">';
    html += '<h2 style="margin: 0 0 10px 0;">Site Visit Report: ' + form.station + '</h2>';
    html += '<p style="margin: 0; font-size: 14px;">Date: ' + form.visitDate + ' | Inspector: ' + (form.inspectorName || form.empId) + '</p>';
    html += '</div>';

    // Overall Shop Photo Section (if available)
    var overallPhotos = attachmentLinks.Overall || attachmentLinks.overall || attachmentLinks.Shop || attachmentLinks.shop || [];
    if (overallPhotos && overallPhotos.length > 0) {
        html += '<div style="padding: 20px; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">';
        html += '<h3 style="color: #1e40af; margin-top: 0; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">';
        html += '<span style="font-size: 20px;">📸</span> Overall Shop Photo';
        html += '</h3>';
        html += '<div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">';
        
        for (var p = 0; p < overallPhotos.length; p++) {
            html += '<div style="flex: 0 0 auto; max-width: 100%;">';
            html += '<a href="' + overallPhotos[p] + '" target="_blank" style="display: block; border: 2px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
            html += '<img src="' + overallPhotos[p] + '" style="max-width: 100%; height: auto; display: block;">';
            html += '</a>';
            html += '</div>';
        }
        
        html += '</div>';
        html += '</div>';
    }

    // General Info
    html += '<div style="padding: 20px;">';
    html += '<h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-top: 0;">General Information</h3>';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee; width: 40%;"><b>Objective:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">' + form.objective + '</td></tr>';
    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Branch Type:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">' + form.branchType + '</td></tr>';
    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Re-Open Date:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">' + form.reOpenDate + '</td></tr>';
    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>DM Name:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">' + form.dmName + '</td></tr>';
    html += '<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>SM Name:</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">' + form.smName + '</td></tr>';
    html += '</table>';

    // Checklists
    // Checklists - New 14 Categories
    var sections = {
        "3.1 ACT (Air Condition)": ["ac_aircon", "ac_fans"],
        "3.2 ADR (Auto Door)": ["const_autodoor"],
        "3.3 BLD (Building)": ["const_roof", "const_wall", "const_tile", "const_ceiling", "const_floor", "const_drain"],
        "3.4 CTS (CCTV & Sound)": ["ee_cctv"],
        "3.5 ELC (Electrical)": ["ee_meter", "ee_panel", "ee_lighting", "ee_emergency", "ee_ups"],
        "3.6 FFE (Furniture & Fixture)": ["ffe_shelving", "ffe_display", "ffe_counter", "ffe_signage", "ffe_basket"],
        "3.7 FHW (Fresh Food Hot Water)": ["gen_waterheater"],
        "3.8 FNT (Furniture)": ["fnt_table", "fnt_cabinet", "fnt_seating"],
        "3.9 IMK (Ice Maker)": ["gen_icefilter"],
        "3.10 PCT (Pest Control)": ["gen_insect"],
        "3.11 RFT (Refrigeration)": ["ref_cdu1", "ref_cdu2", "ref_plugin"],
        "3.12 SAN (Sanitary)": ["pump_pump", "pump_toilet", "pump_sink"],
        "3.13 SEM (Small Equipment)": ["gen_microwave", "gen_toaster", "gen_fireext"],
        "3.14 SFB (Safe Box)": ["gen_safe"]
    };

    var sectionComments = {
        "3.1 ACT (Air Condition)": "ac_comment",
        "3.2 ADR (Auto Door)": "const_comment",
        "3.3 BLD (Building)": "const_comment",
        "3.4 CTS (CCTV & Sound)": "ee_comment",
        "3.5 ELC (Electrical)": "ee_comment",
        "3.6 FFE (Furniture & Fixture)": "gen_comment",
        "3.7 FHW (Fresh Food Hot Water)": "gen_comment",
        "3.8 FNT (Furniture)": "gen_comment",
        "3.9 IMK (Ice Maker)": "gen_comment",
        "3.10 PCT (Pest Control)": "gen_comment",
        "3.11 RFT (Refrigeration)": "ref_comment",
        "3.12 SAN (Sanitary)": "pump_comment",
        "3.13 SEM (Small Equipment)": "gen_comment",
        "3.14 SFB (Safe Box)": "gen_comment"
    };

    html += '<h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-top: 30px;">Inspection Details</h3>';
    for (var secTitle in sections) {
        var keys = sections[secTitle];
        var hasIssues = false;
        
        // Table Header
        var sectionHtml = '<h4 style="margin-top: 20px; border-bottom: 2px solid #eee; padding-bottom: 5px; color: #444;">' + secTitle + '</h4>';
        sectionHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
        
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = form[key];
            var qty = quantities[key] ? ' (Qty: ' + quantities[key] + ')' : '';
            var color = (val === 'ผิดปกติ') ? '#ef4444' : '#22c55e'; // Red vs Green
            var statusStyle = 'color: ' + color + '; font-weight: bold;';
            
            sectionHtml += '<tr>';
            sectionHtml += '<td style="padding: 8px 5px; border-bottom: 1px solid #f0f0f0; width: 70%; text-transform: capitalize;">' + key.replace(/_/g, ' ') + qty + '</td>';
            sectionHtml += '<td style="padding: 8px 5px; border-bottom: 1px solid #f0f0f0; text-align: right;"><span style="' + statusStyle + '">' + val + '</span></td>';
            sectionHtml += '</tr>';
        }
        sectionHtml += '</table>';

        // Add Section Comment
        var commentKey = sectionComments[secTitle];
        var commentVal = form[commentKey];
        if (commentVal) {
             sectionHtml += '<div style="margin-top: 5px; padding: 10px; background-color: #f9f9f9; border-left: 4px solid #ddd; font-style: italic; color: #555; font-size: 14px;"><b>Comment:</b> ' + commentVal + '</div>';
        }

        html += sectionHtml;
    }
    
    // Additional Info
    html += '<h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-top: 30px;">Additional Information</h3>';
    html += '<p><b>Energy Saving:</b> ' + (form.energySaving || '-') + '</p>';
    html += '<p><b>Warranty:</b> ' + (form.warranty || '-') + '</p>';
    html += '<p><b>CMS History:</b> ' + (form.cmsHistory || '-') + '</p>';

    // Attachments
    if (attachmentLinks && Object.keys(attachmentLinks).length > 0) {
        html += '<h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-top: 30px;">Photos</h3>';
        for (var cat in attachmentLinks) {
            // Skip Overall/Shop as it's already shown at the top
            var catLower = cat.toLowerCase();
            if (catLower === 'overall' || catLower === 'shop') continue;

            html += '<h4 style="margin-bottom: 10px; color: #444;">' + cat + '</h4>';
            var links = attachmentLinks[cat];
            html += '<div style="display: flex; gap: 10px; flex-wrap: wrap;">';
            for (var k = 0; k < links.length; k++) {
                // Use thumbnail link for image preview, made responsive
                html += '<img src="' + links[k] + '" style="max-width: 48%; height: auto; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">';
            }
            html += '</div>';
        }
    }

    html += '<div style="margin-top: 30px; padding: 20px 0; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">';
    html += '<p>This is an automated email from Site Visit Reports System.</p>';
    html += '</div>';

    html += '</div></div></body></html>';
    return html;
}


function processSurveyForm(form) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Site_Visit_Database");
        
        // 1. Prepare Data Map (Header Name -> Value)
        var id = "SVR-" + new Date().getTime(); 
        
        // Handle Attachments
        var attachmentLinks = {};
        if (form.attachments) {
            var folderName = "Site_Visit_Attachments";
            var folder;
            var folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(folderName); }
            
            for (var category in form.attachments) {
                var files = form.attachments[category]; 
                if (files && files.length > 0) {
                    attachmentLinks[category] = [];
                    files.forEach(function(fileData) {
                         var filename = id + "_" + category + "_" + fileData.name;
                         var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
                         var file = folder.createFile(blob);
                         file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                         attachmentLinks[category].push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    });
                }
            }
        }

        // Capture Quantities
        var quantities = {};
        for (var key in form) {
            if (key.indexOf('_qty') > -1) {
                quantities[key.replace('_qty', '')] = form[key];
            }
        }

        var dataToSave = {
            "Timestamp": new Date(),
            "ID": id,
            "Recorder ID": form.empId,
            "Station": form.station,
            "Visit Date": form.visitDate,
            "Objective": form.objective,
            "Re-Open Date": form.reOpenDate,
            "Branch Type": form.branchType,
            "DM Name": form.dmName,
            "Cluster Name": form.clusterName,
            "SM Name": form.smName,
            
            // 1. EE
            "EE_Meter": form.ee_meter, "EE_Panel": form.ee_panel, "EE_Lighting": form.ee_lighting, 
            "EE_Emergency": form.ee_emergency, "EE_CCTV": form.ee_cctv, "EE_UPS": form.ee_ups,
            
            // 2. Ref
            "Ref_CDU1": form.ref_cdu1, "Ref_CDU2": form.ref_cdu2, "Ref_Plugin": form.ref_plugin,
            
            // 3. AC
            "AC_Aircon": form.ac_aircon, "AC_Fans": form.ac_fans,
            
            // 4. General
            "Gen_Microwave": form.gen_microwave, "Gen_WaterHeater": form.gen_waterheater, "Gen_Safe": form.gen_safe,
            "Gen_FireExt": form.gen_fireext, "Gen_Insect": form.gen_insect, "Gen_Toaster": form.gen_toaster, "Gen_IceFilter": form.gen_icefilter,
            
            // 5. Construction
            "Const_Roof": form.const_roof, "Const_Wall": form.const_wall, "Const_Tile": form.const_tile,
            "Const_Ceiling": form.const_ceiling, "Const_Floor": form.const_floor, "Const_Drain": form.const_drain, "Const_AutoDoor": form.const_autodoor,
            
            // 6. Pump
            "Pump_Pump": form.pump_pump, "Pump_Toilet": form.pump_toilet, "Pump_Sink": form.pump_sink,
            
            // 7. FFE (Furniture & Fixture)
            "FFE_Shelving": form.ffe_shelving, "FFE_Display": form.ffe_display, "FFE_Counter": form.ffe_counter,
            "FFE_Signage": form.ffe_signage, "FFE_Basket": form.ffe_basket,
            
            // 8. FNT (Furniture)
            "FNT_Table": form.fnt_table, "FNT_Cabinet": form.fnt_cabinet, "FNT_Seating": form.fnt_seating,
            
            // Info
            "Energy Saving": form.energySaving, "Warranty": form.warranty, "CMS History": form.cmsHistory,
            
            // Status
            "Status": "Pending", "Acknowledged By": "", "Acknowledge Date": "",
            
            // Follow-up Tracking
            "Follow-up Correction Status": "Not Started", "Follow-up PM Plan": "Not Required", "Follow-up Notes": "", "Follow-up Date": "", "Follow-up By": "",
            
            // Comments
            "EE_Comment": form.ee_comment || "", "Ref_Comment": form.ref_comment || "", "AC_Comment": form.ac_comment || "",
            "Gen_Comment": form.gen_comment || "", "Const_Comment": form.const_comment || "", "Pump_Comment": form.pump_comment || "",
            
            // Attachments
            "Attachments_JSON": JSON.stringify(attachmentLinks),
            "Quantities_JSON": JSON.stringify(quantities)
        };

        // 2. Handle Sheet & Headers
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Site_Visit_Database");
            // Create headers from data keys
            var initialHeaders = Object.keys(dataToSave);
            sheet.appendRow(initialHeaders);
        }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        // 3. Ensure all keys in dataToSave exist as headers
        var headersUpdated = false;
        Object.keys(dataToSave).forEach(function(key) {
            if (headers.indexOf(key) === -1) {
                headers.push(key); // Add to local array
                sheet.getRange(1, headers.length).setValue(key); // Add to sheet
                headersUpdated = true;
            }
        });

        // 4. Construct Row based on Headers
        var row = headers.map(function(header) {
            // Return empty string if undefined
            return dataToSave[header] !== undefined ? dataToSave[header] : "";
        });

        sheet.appendRow(row);
        
        // --- EMAIL NOTIFICATION LOGIC ---
        try {
            var toEmail = "";
            var ccEmails = [];
            
            // 1. Get Inspector Email from selected employee (form.empId)
            var inspectorEmail = getEmployeeEmail(form.empId);
            
            // 2. Get N, N+1, N+2 Chain based on Inspector (form.empId)
            // chainEmails = [N (Inspector), N+1 (Inspector's Manager), N+2 (Inspector's Senior Manager)]
            var chainEmails = getManagerChain(form.empId, inspectorEmail);
            
            // Set To: N (Inspector - the person selected in the dropdown)
            toEmail = chainEmails.length > 0 ? chainEmails[0] : inspectorEmail;
            
            // Set CC: N+1, N+2 (Inspector's managers)
            if (chainEmails.length > 1) {
                ccEmails = ccEmails.concat(chainEmails.slice(1));
            }

            // 3. Add Manual CC Emails
            if (form.ccEmail1) ccEmails.push(form.ccEmail1);
            if (form.ccEmail2) ccEmails.push(form.ccEmail2);
            if (form.ccEmail3) ccEmails.push(form.ccEmail3);
            
            // Normalize emails to lowercase and trim
            // Ensure TO is normalized
            toEmail = toEmail.trim().toLowerCase();

            // Normalize CCs
            ccEmails = ccEmails.map(function(email) {
                return email ? email.toString().trim().toLowerCase() : "";
            });

            // Remove duplicates from CC and filter empty
            // Also remove TO email from CC list if present
            ccEmails = ccEmails.filter(function(item, pos) {
                return ccEmails.indexOf(item) == pos && item && item !== toEmail;
            });

            var ccString = ccEmails.join(",");
            
            // Get Inspector Name
            form.inspectorName = findNameById(form.empId) || form.empId;

            // Generate Email Body
            // Make sure quantities are passed correctly (they were captured above)
            var htmlBody = generateEmailBody(form, attachmentLinks, quantities);
            
            Logger.log("Sending email to: " + toEmail + ", cc: " + ccString);
            Logger.log("Quantities: " + JSON.stringify(quantities));

            // Send Email
            MailApp.sendEmail({
                to: toEmail,
                cc: ccString,
                subject: "Site Visit Report - " + form.station + " (" + form.visitDate + ")",
                htmlBody: htmlBody
            });

        } catch (e) {
            Logger.log("Error sending email: " + e);
        }

        return { success: true };

    } catch (error) {
        return { success: false, error: error.toString() };
    }
}

function processAirConSurveyForm(form) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        
        // 1. Prepare Data Map
        var id = "ACS-" + new Date().getTime(); 
        
        // Handle Attachments
        var attachmentLinks = {};
        if (form.attachments) {
            var folderName = "Aircon_Survey_Attachments";
            var folder;
            var folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(folderName); }
            
            for (var category in form.attachments) {
                var files = form.attachments[category]; 
                if (files && files.length > 0) {
                    attachmentLinks[category] = [];
                    files.forEach(function(fileData) {
                         var filename = id + "_" + category + "_" + fileData.name;
                         var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
                         var file = folder.createFile(blob);
                         file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                         attachmentLinks[category].push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    });
                }
            }
        }

        var dataToSave = {
            "Timestamp": new Date(),
            "ID": id,
            "Reporter Email": form.reporterEmail || "",
            "Reporter Name": form.reporterName || "",
            "Branch Code": form.branchCode || "",
            "Branch Name": form.branchName || "",
            "AC Quantity": form.acQuantity || "",
            "AC Brand": form.acBrand || "",
            "Has Broken AC": form.hasBrokenAc || "No",
            "Broken Units": form.brokenUnits || "",

            // Unit 1
            "Unit 1 Type":              form.AcUnit1_Type || "",
            "Unit 1 Brand":             form.AcUnit1_Brand || "",
            "Unit 1 Asset No":          form.AcUnit1_AssetNo || "",
            "Unit 1 Status":            form.AcUnit1_Status || "ใช้งาน",
            "Filter Cleanliness 1":     form.Aircon_Filter_1 || "",
            "Cooling Performance 1":    form.Aircon_Cooling_1 || "",
            "Drainage Leakage 1":       form.Aircon_Drainage_1 || "",
            "Operational Noise 1":      form.Aircon_Noise_1 || "",
            "Equipment Condition 1":    form.Aircon_Condition_1 || "",
            "Unit 1 Note":              form.AcUnit1_Note || "",

            // Unit 2
            "Unit 2 Type":              form.AcUnit2_Type || "",
            "Unit 2 Brand":             form.AcUnit2_Brand || "",
            "Unit 2 Asset No":          form.AcUnit2_AssetNo || "",
            "Unit 2 Status":            form.AcUnit2_Status || "ใช้งาน",
            "Filter Cleanliness 2":     form.Aircon_Filter_2 || "",
            "Cooling Performance 2":    form.Aircon_Cooling_2 || "",
            "Drainage Leakage 2":       form.Aircon_Drainage_2 || "",
            "Operational Noise 2":      form.Aircon_Noise_2 || "",
            "Equipment Condition 2":    form.Aircon_Condition_2 || "",
            "Unit 2 Note":              form.AcUnit2_Note || "",

            // Unit 3
            "Unit 3 Type":              form.AcUnit3_Type || "",
            "Unit 3 Brand":             form.AcUnit3_Brand || "",
            "Unit 3 Asset No":          form.AcUnit3_AssetNo || "",
            "Unit 3 Status":            form.AcUnit3_Status || "ใช้งาน",
            "Filter Cleanliness 3":     form.Aircon_Filter_3 || "",
            "Cooling Performance 3":    form.Aircon_Cooling_3 || "",
            "Drainage Leakage 3":       form.Aircon_Drainage_3 || "",
            "Operational Noise 3":      form.Aircon_Noise_3 || "",
            "Equipment Condition 3":    form.Aircon_Condition_3 || "",
            "Unit 3 Note":              form.AcUnit3_Note || "",

            // Unit 4
            "Unit 4 Type":              form.AcUnit4_Type || "",
            "Unit 4 Brand":             form.AcUnit4_Brand || "",
            "Unit 4 Asset No":          form.AcUnit4_AssetNo || "",
            "Unit 4 Status":            form.AcUnit4_Status || "ใช้งาน",
            "Filter Cleanliness 4":     form.Aircon_Filter_4 || "",
            "Cooling Performance 4":    form.Aircon_Cooling_4 || "",
            "Drainage Leakage 4":       form.Aircon_Drainage_4 || "",
            "Operational Noise 4":      form.Aircon_Noise_4 || "",
            "Equipment Condition 4":    form.Aircon_Condition_4 || "",
            "Unit 4 Note":              form.AcUnit4_Note || "",

            // Unit 5
            "Unit 5 Type":              form.AcUnit5_Type || "",
            "Unit 5 Brand":             form.AcUnit5_Brand || "",
            "Unit 5 Asset No":          form.AcUnit5_AssetNo || "",
            "Unit 5 Status":            form.AcUnit5_Status || "ใช้งาน",
            "Filter Cleanliness 5":     form.Aircon_Filter_5 || "",
            "Cooling Performance 5":    form.Aircon_Cooling_5 || "",
            "Drainage Leakage 5":       form.Aircon_Drainage_5 || "",
            "Operational Noise 5":      form.Aircon_Noise_5 || "",
            "Equipment Condition 5":    form.Aircon_Condition_5 || "",
            "Unit 5 Note":              form.AcUnit5_Note || "",

            // Unit 6
            "Unit 6 Type":              form.AcUnit6_Type || "",
            "Unit 6 Brand":             form.AcUnit6_Brand || "",
            "Unit 6 Asset No":          form.AcUnit6_AssetNo || "",
            "Unit 6 Status":            form.AcUnit6_Status || "ใช้งาน",
            "Filter Cleanliness 6":     form.Aircon_Filter_6 || "",
            "Cooling Performance 6":    form.Aircon_Cooling_6 || "",
            "Drainage Leakage 6":       form.Aircon_Drainage_6 || "",
            "Operational Noise 6":      form.Aircon_Noise_6 || "",
            "Equipment Condition 6":    form.Aircon_Condition_6 || "",
            "Unit 6 Note":              form.AcUnit6_Note || "",

            // Unit 7
            "Unit 7 Type":              form.AcUnit7_Type || "",
            "Unit 7 Brand":             form.AcUnit7_Brand || "",
            "Unit 7 Asset No":          form.AcUnit7_AssetNo || "",
            "Unit 7 Status":            form.AcUnit7_Status || "ใช้งาน",
            "Filter Cleanliness 7":     form.Aircon_Filter_7 || "",
            "Cooling Performance 7":    form.Aircon_Cooling_7 || "",
            "Drainage Leakage 7":       form.Aircon_Drainage_7 || "",
            "Operational Noise 7":      form.Aircon_Noise_7 || "",
            "Equipment Condition 7":    form.Aircon_Condition_7 || "",
            "Unit 7 Note":              form.AcUnit7_Note || "",

            // Unit 8
            "Unit 8 Type":              form.AcUnit8_Type || "",
            "Unit 8 Brand":             form.AcUnit8_Brand || "",
            "Unit 8 Asset No":          form.AcUnit8_AssetNo || "",
            "Unit 8 Status":            form.AcUnit8_Status || "ใช้งาน",
            "Filter Cleanliness 8":     form.Aircon_Filter_8 || "",
            "Cooling Performance 8":    form.Aircon_Cooling_8 || "",
            "Drainage Leakage 8":       form.Aircon_Drainage_8 || "",
            "Operational Noise 8":      form.Aircon_Noise_8 || "",
            "Equipment Condition 8":    form.Aircon_Condition_8 || "",
            "Unit 8 Note":              form.AcUnit8_Note || "",

            // Unit 9
            "Unit 9 Type":              form.AcUnit9_Type || "",
            "Unit 9 Brand":             form.AcUnit9_Brand || "",
            "Unit 9 Asset No":          form.AcUnit9_AssetNo || "",
            "Unit 9 Status":            form.AcUnit9_Status || "ใช้งาน",
            "Filter Cleanliness 9":     form.Aircon_Filter_9 || "",
            "Cooling Performance 9":    form.Aircon_Cooling_9 || "",
            "Drainage Leakage 9":       form.Aircon_Drainage_9 || "",
            "Operational Noise 9":      form.Aircon_Noise_9 || "",
            "Equipment Condition 9":    form.Aircon_Condition_9 || "",
            "Unit 9 Note":              form.AcUnit9_Note || "",

            // Unit 10
            "Unit 10 Type":              form.AcUnit10_Type || "",
            "Unit 10 Brand":             form.AcUnit10_Brand || "",
            "Unit 10 Asset No":          form.AcUnit10_AssetNo || "",
            "Unit 10 Status":            form.AcUnit10_Status || "ใช้งาน",
            "Filter Cleanliness 10":     form.Aircon_Filter_10 || "",
            "Cooling Performance 10":    form.Aircon_Cooling_10 || "",
            "Drainage Leakage 10":       form.Aircon_Drainage_10 || "",
            "Operational Noise 10":      form.Aircon_Noise_10 || "",
            "Equipment Condition 10":    form.Aircon_Condition_10 || "",
            "Unit 10 Note":              form.AcUnit10_Note || "",

            // Unit 11
            "Unit 11 Type":              form.AcUnit11_Type || "",
            "Unit 11 Brand":             form.AcUnit11_Brand || "",
            "Unit 11 Asset No":          form.AcUnit11_AssetNo || "",
            "Unit 11 Status":            form.AcUnit11_Status || "ใช้งาน",
            "Filter Cleanliness 11":     form.Aircon_Filter_11 || "",
            "Cooling Performance 11":    form.Aircon_Cooling_11 || "",
            "Drainage Leakage 11":       form.Aircon_Drainage_11 || "",
            "Operational Noise 11":      form.Aircon_Noise_11 || "",
            "Equipment Condition 11":    form.Aircon_Condition_11 || "",
            "Unit 11 Note":              form.AcUnit11_Note || "",

            // Unit 12
            "Unit 12 Type":              form.AcUnit12_Type || "",
            "Unit 12 Brand":             form.AcUnit12_Brand || "",
            "Unit 12 Asset No":          form.AcUnit12_AssetNo || "",
            "Unit 12 Status":            form.AcUnit12_Status || "ใช้งาน",
            "Filter Cleanliness 12":     form.Aircon_Filter_12 || "",
            "Cooling Performance 12":    form.Aircon_Cooling_12 || "",
            "Drainage Leakage 12":       form.Aircon_Drainage_12 || "",
            "Operational Noise 12":      form.Aircon_Noise_12 || "",
            "Equipment Condition 12":    form.Aircon_Condition_12 || "",
            "Unit 12 Note":              form.AcUnit12_Note || "",

            // Unit 13
            "Unit 13 Type":              form.AcUnit13_Type || "",
            "Unit 13 Brand":             form.AcUnit13_Brand || "",
            "Unit 13 Asset No":          form.AcUnit13_AssetNo || "",
            "Unit 13 Status":            form.AcUnit13_Status || "ใช้งาน",
            "Filter Cleanliness 13":     form.Aircon_Filter_13 || "",
            "Cooling Performance 13":    form.Aircon_Cooling_13 || "",
            "Drainage Leakage 13":       form.Aircon_Drainage_13 || "",
            "Operational Noise 13":      form.Aircon_Noise_13 || "",
            "Equipment Condition 13":    form.Aircon_Condition_13 || "",
            "Unit 13 Note":              form.AcUnit13_Note || "",

            // Unit 14
            "Unit 14 Type":              form.AcUnit14_Type || "",
            "Unit 14 Brand":             form.AcUnit14_Brand || "",
            "Unit 14 Asset No":          form.AcUnit14_AssetNo || "",
            "Unit 14 Status":            form.AcUnit14_Status || "ใช้งาน",
            "Filter Cleanliness 14":     form.Aircon_Filter_14 || "",
            "Cooling Performance 14":    form.Aircon_Cooling_14 || "",
            "Drainage Leakage 14":       form.Aircon_Drainage_14 || "",
            "Operational Noise 14":      form.Aircon_Noise_14 || "",
            "Equipment Condition 14":    form.Aircon_Condition_14 || "",
            "Unit 14 Note":              form.AcUnit14_Note || "",

            // Unit 15
            "Unit 15 Type":              form.AcUnit15_Type || "",
            "Unit 15 Brand":             form.AcUnit15_Brand || "",
            "Unit 15 Asset No":          form.AcUnit15_AssetNo || "",
            "Unit 15 Status":            form.AcUnit15_Status || "ใช้งาน",
            "Filter Cleanliness 15":     form.Aircon_Filter_15 || "",
            "Cooling Performance 15":    form.Aircon_Cooling_15 || "",
            "Drainage Leakage 15":       form.Aircon_Drainage_15 || "",
            "Operational Noise 15":      form.Aircon_Noise_15 || "",
            "Equipment Condition 15":    form.Aircon_Condition_15 || "",
            "Unit 15 Note":              form.AcUnit15_Note || "",

            // Unit 16
            "Unit 16 Type":              form.AcUnit16_Type || "",
            "Unit 16 Brand":             form.AcUnit16_Brand || "",
            "Unit 16 Asset No":          form.AcUnit16_AssetNo || "",
            "Unit 16 Status":            form.AcUnit16_Status || "ใช้งาน",
            "Filter Cleanliness 16":     form.Aircon_Filter_16 || "",
            "Cooling Performance 16":    form.Aircon_Cooling_16 || "",
            "Drainage Leakage 16":       form.Aircon_Drainage_16 || "",
            "Operational Noise 16":      form.Aircon_Noise_16 || "",
            "Equipment Condition 16":    form.Aircon_Condition_16 || "",
            "Unit 16 Note":              form.AcUnit16_Note || "",

            // Unit 17
            "Unit 17 Type":              form.AcUnit17_Type || "",
            "Unit 17 Brand":             form.AcUnit17_Brand || "",
            "Unit 17 Asset No":          form.AcUnit17_AssetNo || "",
            "Unit 17 Status":            form.AcUnit17_Status || "ใช้งาน",
            "Filter Cleanliness 17":     form.Aircon_Filter_17 || "",
            "Cooling Performance 17":    form.Aircon_Cooling_17 || "",
            "Drainage Leakage 17":       form.Aircon_Drainage_17 || "",
            "Operational Noise 17":      form.Aircon_Noise_17 || "",
            "Equipment Condition 17":    form.Aircon_Condition_17 || "",
            "Unit 17 Note":              form.AcUnit17_Note || "",

            // Unit 18
            "Unit 18 Type":              form.AcUnit18_Type || "",
            "Unit 18 Brand":             form.AcUnit18_Brand || "",
            "Unit 18 Asset No":          form.AcUnit18_AssetNo || "",
            "Unit 18 Status":            form.AcUnit18_Status || "ใช้งาน",
            "Filter Cleanliness 18":     form.Aircon_Filter_18 || "",
            "Cooling Performance 18":    form.Aircon_Cooling_18 || "",
            "Drainage Leakage 18":       form.Aircon_Drainage_18 || "",
            "Operational Noise 18":      form.Aircon_Noise_18 || "",
            "Equipment Condition 18":    form.Aircon_Condition_18 || "",
            "Unit 18 Note":              form.AcUnit18_Note || "",

            // Unit 19
            "Unit 19 Type":              form.AcUnit19_Type || "",
            "Unit 19 Brand":             form.AcUnit19_Brand || "",
            "Unit 19 Asset No":          form.AcUnit19_AssetNo || "",
            "Unit 19 Status":            form.AcUnit19_Status || "ใช้งาน",
            "Filter Cleanliness 19":     form.Aircon_Filter_19 || "",
            "Cooling Performance 19":    form.Aircon_Cooling_19 || "",
            "Drainage Leakage 19":       form.Aircon_Drainage_19 || "",
            "Operational Noise 19":      form.Aircon_Noise_19 || "",
            "Equipment Condition 19":    form.Aircon_Condition_19 || "",
            "Unit 19 Note":              form.AcUnit19_Note || "",

            // Unit 20
            "Unit 20 Type":              form.AcUnit20_Type || "",
            "Unit 20 Brand":             form.AcUnit20_Brand || "",
            "Unit 20 Asset No":          form.AcUnit20_AssetNo || "",
            "Unit 20 Status":            form.AcUnit20_Status || "ใช้งาน",
            "Filter Cleanliness 20":     form.Aircon_Filter_20 || "",
            "Cooling Performance 20":    form.Aircon_Cooling_20 || "",
            "Drainage Leakage 20":       form.Aircon_Drainage_20 || "",
            "Operational Noise 20":      form.Aircon_Noise_20 || "",
            "Equipment Condition 20":    form.Aircon_Condition_20 || "",
            "Unit 20 Note":              form.AcUnit20_Note || "",

            "DM Area": form.dmArea || "",
            "CM Area": form.cmArea || "",
            "AMM MTN": form.ammMtn || "",
            "Comments": form.comments || "",
            "Status": form.isDraft ? "Draft" : "Pending",
            "Attachments_JSON": JSON.stringify(attachmentLinks)
        };

        // 2. Handle Sheet & Headers
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Aircon_Survey_Database");
            var initialHeaders = Object.keys(dataToSave);
            sheet.appendRow(initialHeaders);
        }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        // 3. Ensure all keys in dataToSave exist as headers
        var headersUpdated = false;
        Object.keys(dataToSave).forEach(function(key) {
            if (headers.indexOf(key) === -1) {
                headers.push(key);
                sheet.getRange(1, headers.length).setValue(key);
                headersUpdated = true;
            }
        });

        // 4. Construct Row
        var row = headers.map(function(header) {
            return dataToSave[header] !== undefined ? dataToSave[header] : "";
        });

        sheet.appendRow(row);
        
        // --- EMAIL NOTIFICATION LOGIC ---
        if (!form.isDraft) {
        try {
            var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
            var ccEmails = [];

            if (form.ccEmail1) ccEmails.push(form.ccEmail1);
            if (form.ccEmail2) ccEmails.push(form.ccEmail2);
            
            // Normalize CCs
            ccEmails = ccEmails.map(function(email) {
                return email ? email.toString().trim().toLowerCase() : "";
            });

            ccEmails = ccEmails.filter(function(item, pos) {
                return ccEmails.indexOf(item) == pos && item && item !== toEmail;
            });

            var ccString = ccEmails.join(",");

            // Helper: status colour for checklist items
            function acStatusStyle(val) {
                if (!val || val === '' || val === '-') return 'color:#6b7280;font-weight:bold;';
                if (val === 'ผิดปกติ' || val === 'NG') return 'color:#b91c1c;font-weight:bold;';
                if (val === 'ปกติ'    || val === 'OK') return 'color:#15803d;font-weight:bold;';
                return 'color:#92400e;font-weight:bold;';
            }

            // Helper: render photo thumbnails row
            function renderPhotoRow(photoArr) {
                if (!photoArr || photoArr.length === 0) return '';
                var html = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0;">';
                html += '<p style="margin:0 0 6px 0;font-size:11px;color:#6b7280;font-weight:600;">📷 รูปภาพ (' + photoArr.length + ' รูป)</p>';
                html += '<table cellpadding="0" cellspacing="4" width="100%"><tr>';
                for (var pi = 0; pi < photoArr.length; pi++) {
                    var viewUrl = photoArr[pi].replace('thumbnail?sz=w1000&', 'uc?export=view&');
                    html += '<td width="25%" style="max-width:140px;padding:2px;">';
                    html += '<a href="' + viewUrl + '" target="_blank">';
                    html += '<img src="' + photoArr[pi] + '" width="100%" style="border-radius:4px;border:1px solid #e5e7eb;display:block;">';
                    html += '</a></td>';
                    if ((pi + 1) % 4 === 0 && pi + 1 < photoArr.length) html += '</tr><tr>';
                }
                html += '</tr></table></div>';
                return html;
            }

            var acTypeCodes = { 'Wall Type':'WT', 'Cassette Type':'CT', 'Floor Standing':'FS', 'Package Type':'PT' };
            var brokenList = form.brokenUnits ? form.brokenUnits.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
            var qty = parseInt(form.acQuantity) || 0;

            // Generate Email Body
            var htmlBody = '<html><body style="font-family:\'Segoe UI\',Arial,sans-serif;color:#1e293b;margin:0;padding:16px 0;background-color:#f1f5f9;">';
            htmlBody += '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">';

            // Header
            htmlBody += '<div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px 20px;text-align:center;">';
            htmlBody += '<h2 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">🌬️ Air Conditioner Survey Report</h2>';
            htmlBody += '<p style="margin:0;font-size:14px;opacity:0.9;">' + (form.branchCode || '') + ' — ' + (form.branchName || '') + '</p>';
            htmlBody += '</div>';

            htmlBody += '<div style="padding:20px;">';

            // General Info
            htmlBody += '<table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:16px;font-size:13px;">';
            htmlBody += '<tr><td colspan="2" style="padding:10px 12px 4px 12px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;">General Information</td></tr>';
            htmlBody += '<tr><td style="padding:4px 12px;color:#3b82f6;">Branch</td><td style="padding:4px 12px;font-weight:600;color:#1e3a8a;">' + (form.branchCode || '') + ' — ' + (form.branchName || '') + '</td></tr>';
            htmlBody += '<tr><td style="padding:4px 12px;color:#3b82f6;">Reporter</td><td style="padding:4px 12px;font-weight:600;color:#1e3a8a;">' + (form.reporterName || 'N/A') + '</td></tr>';
            htmlBody += '<tr><td style="padding:4px 12px;color:#3b82f6;">AC Quantity</td><td style="padding:4px 12px;font-weight:600;color:#1e3a8a;">' + (form.acQuantity || 'N/A') + ' เครื่อง</td></tr>';
            htmlBody += '<tr><td style="padding:4px 12px;color:#3b82f6;">AC Brand(s)</td><td style="padding:4px 12px;font-weight:600;color:#1e3a8a;">' + (form.acBrand || 'N/A') + '</td></tr>';
            htmlBody += '<tr><td style="padding:4px 12px 10px 12px;color:#ef4444;font-weight:600;">Broken Units</td><td style="padding:4px 12px 10px 12px;font-weight:700;color:#b91c1c;">' + (form.brokenUnits || 'None') + '</td></tr>';
            htmlBody += '</table>';

            // Per-unit section
            if (qty > 0) {
                htmlBody += '<p style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px 0;">รายละเอียดแต่ละเครื่อง (' + qty + ' เครื่อง)</p>';
                for (var ui = 1; ui <= qty; ui++) {
                    var uBrand  = form['AcUnit' + ui + '_Brand']   || '';
                    var uType   = form['AcUnit' + ui + '_Type']    || '';
                    var uAsset  = form['AcUnit' + ui + '_AssetNo'] || '';
                    var uNote   = form['AcUnit' + ui + '_Note']    || '';
                    var typeCode = acTypeCodes[uType] || 'AC';
                    var padNum = ui < 10 ? '0' + ui : String(ui);
                    var equipId = form.branchCode ? form.branchCode + '-' + typeCode + padNum : typeCode + padNum;
                    var isBroken = brokenList.indexOf(String(ui)) !== -1;
                    var headerBg = isBroken ? '#dc2626' : '#2563eb';
                    var cardBg   = isBroken ? '#fff7f7' : '#f8fafc';
                    var cardBorder = isBroken ? '#fecaca' : '#e2e8f0';

                    // Combine inventory photo + symptom photo
                    var unitPhotos = [].concat(attachmentLinks['ac_inv_' + ui] || [], attachmentLinks['ac_unit_' + ui] || []);

                    var typeNames = { 'Wall Type':'แอร์ติดผนัง','Cassette Type':'แอร์แขวน/ฝังฝ้า','Floor Standing':'แอร์ตั้งพื้น','Package Type':'แอร์ตู้ตั้งพื้น' };
                    var typeName  = typeNames[uType] || uType || '—';

                    htmlBody += '<div style="border:1px solid ' + cardBorder + ';border-radius:8px;overflow:hidden;margin-bottom:12px;">';

                    // Card header
                    htmlBody += '<div style="background:' + headerBg + ';color:white;padding:8px 12px;font-size:13px;font-weight:700;display:flex;justify-content:space-between;">';
                    htmlBody += '<span>🌬️ แอร์เบอร์ ' + ui + (isBroken ? ' ⚠️ ชำรุด' : '') + '</span>';
                    htmlBody += '<span style="font-family:monospace;font-size:11px;opacity:0.85;">' + equipId + '</span>';
                    htmlBody += '</div>';

                    // Card body
                    htmlBody += '<div style="padding:10px 12px;background:' + cardBg + ';font-size:12px;">';
                    var uStatus = form['AcUnit' + ui + '_Status'] || 'ใช้งาน';
                    var uStatusStyle = uStatus === 'ใช้งาน'
                        ? 'display:inline-block;padding:1px 8px;border-radius:12px;background:#dcfce7;color:#15803d;border:1px solid #86efac;font-weight:700;font-size:11px;'
                        : 'display:inline-block;padding:1px 8px;border-radius:12px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:700;font-size:11px;';
                    htmlBody += '<table width="100%" cellpadding="2" cellspacing="0" style="margin-bottom:8px;">';
                    htmlBody += '<tr><td style="color:#64748b;width:40%;">ยี่ห้อ (Brand)</td><td style="font-weight:600;">' + (uBrand || '—') + '</td></tr>';
                    htmlBody += '<tr><td style="color:#64748b;">ประเภท (Type)</td><td style="font-weight:600;">' + typeName + '</td></tr>';
                    if (uAsset) htmlBody += '<tr><td style="color:#64748b;">Asset No.</td><td style="font-family:monospace;font-weight:600;">' + uAsset + '</td></tr>';
                    htmlBody += '<tr><td style="color:#64748b;">สถานะ</td><td><span style="' + uStatusStyle + '">' + (uStatus === 'ใช้งาน' ? '✓ ใช้งาน' : '✗ ไม่ใช้งาน') + '</span></td></tr>';
                    htmlBody += '</table>';

                    // Checklist (show for all; empty = no data reported)
                    var checks = [
                        ['ความสะอาดแผงคอยล์/ฟิลเตอร์', 'Aircon_Filter_'],
                        ['ความเย็น/การกระจายลม',         'Aircon_Cooling_'],
                        ['การระบายน้ำ/น้ำหยด',           'Aircon_Drainage_'],
                        ['เสียงการทำงาน',                 'Aircon_Noise_'],
                        ['สภาพอุปกรณ์/หน้ากากแอร์',     'Aircon_Condition_']
                    ];
                    var hasChecklist = checks.some(function(c){ return !!form[c[1] + ui]; });
                    if (hasChecklist) {
                        htmlBody += '<table width="100%" cellpadding="3" cellspacing="0" style="border-top:1px solid ' + (isBroken ? '#fecaca' : '#e2e8f0') + ';margin-top:6px;">';
                        checks.forEach(function(c) {
                            var val = form[c[1] + ui] || '—';
                            htmlBody += '<tr>';
                            htmlBody += '<td style="color:#64748b;font-size:11px;">' + c[0] + '</td>';
                            htmlBody += '<td style="text-align:right;' + acStatusStyle(val) + 'font-size:11px;">' + val + '</td>';
                            htmlBody += '</tr>';
                        });
                        htmlBody += '</table>';
                    }

                    // Note
                    if (uNote) {
                        htmlBody += '<div style="margin-top:6px;padding:6px 8px;background:#fef9c3;border:1px solid #fde68a;border-radius:4px;font-size:11px;color:#92400e;"><b>หมายเหตุ:</b> ' + uNote + '</div>';
                    }

                    // Photos
                    htmlBody += renderPhotoRow(unitPhotos);

                    htmlBody += '</div></div>';
                }
            }

            // Comments
            if (form.comments) {
                htmlBody += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:8px;font-size:13px;">';
                htmlBody += '<p style="margin:0 0 4px 0;font-weight:700;color:#475569;">📝 สรุปปัญหา (Additional Findings)</p>';
                htmlBody += '<p style="margin:0;color:#374151;">' + form.comments + '</p>';
                htmlBody += '</div>';
            }

            // Overall / non-per-unit photos (e.g. Overall_Photos)
            // Per-unit photos are already embedded inside each unit card above.
            var unitCats = {};
            for (var ui2 = 1; ui2 <= qty; ui2++) {
                unitCats['ac_inv_' + ui2] = true;
                unitCats['ac_unit_' + ui2] = true;
            }
            var otherCats = Object.keys(attachmentLinks).filter(function(k) { return !unitCats[k]; });
            if (otherCats.length > 0) {
                htmlBody += '<div style="margin-top:12px;">';
                htmlBody += '<p style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;">รูปภาพอื่นๆ</p>';
                otherCats.forEach(function(cat) {
                    var links = attachmentLinks[cat];
                    if (!links || links.length === 0) return;
                    var catLabel = cat.replace(/_/g, ' ');
                    var totalLinks = links.length;
                    htmlBody += '<div style="margin-bottom:12px;">';
                    htmlBody += '<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#2563eb;border-left:3px solid #93c5fd;padding-left:8px;">' + catLabel + ' (' + totalLinks + ' รูป)</p>';
                    htmlBody += '<table cellpadding="0" cellspacing="4" width="100%"><tr>';
                    for (var pi = 0; pi < links.length; pi++) {
                        var vUrl = links[pi].replace('thumbnail?sz=w1000&', 'uc?export=view&');
                        htmlBody += '<td valign="top" width="25%" style="max-width:140px;padding:2px;">';
                        htmlBody += '<a href="' + vUrl + '" target="_blank">';
                        htmlBody += '<img src="' + links[pi] + '" width="100%" style="border-radius:4px;border:1px solid #e5e7eb;display:block;">';
                        htmlBody += '</a></td>';
                        if ((pi + 1) % 4 === 0 && pi + 1 < links.length) htmlBody += '</tr><tr>';
                    }
                    htmlBody += '</tr></table></div>';
                });
                htmlBody += '</div>';
            }

            htmlBody += '</div>'; // end padding div
            htmlBody += '<div style="padding:16px 20px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;text-align:center;">This is an automated email from the Air Conditioner Survey System.</div>';
            htmlBody += '</div></body></html>';

            Logger.log("Sending AirCon email to: " + toEmail + ", cc: " + ccString);

            MailApp.sendEmail({
                to: toEmail,
                cc: ccString,
                subject: "Air Conditioner Survey - " + form.branchName + " (" + form.branchCode + ")",
                htmlBody: htmlBody
            });

        } catch (e) {
            Logger.log("Error sending email: " + e);
        }
        } // end if (!form.isDraft)

        _invalidateAcSlimCache();
        return { success: true };

    } catch (error) {
        return { success: false, error: error.toString() };
    }
}

function findEmailByName(name) {
    if (!name) return null;
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        // Assume Name is Col C (Index 2) or Col B (Index 1) and Email is Col G (Index 6)
        // Adjust these indices based on actual sheet structure
        
        for (var i = 1; i < data.length; i++) {
            // Check Col 2 (Name) or Col 3 (Name Eng)
            var rowName = data[i][2]; 
             // Start fuzzy match or exact match
            if (rowName && rowName.toString().toLowerCase().indexOf(name.toLowerCase()) !== -1) {
                return data[i][6]; // Email column
            }
        }
    } catch (e) {
        Logger.log("Error looking up email for " + name + ": " + e);
    }
    return null;
}

function findNameById(empId) {
    if (!empId) return null;
    try {
        var sheet = findEmployeeSheet();
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        var idCol = -1, nameCol = -1;
        
        // Find columns
        for (var h = 0; h < headers.length; h++) {
            var header = String(headers[h]).trim().toLowerCase();
            if (header === "employee id" || header === "emp id") idCol = h;
            if (header === "full name" || header === "name") nameCol = h;
        }

        if (idCol !== -1 && nameCol !== -1) {
             for (var i = 1; i < data.length; i++) {
                if (String(data[i][idCol]).trim() === String(empId).trim()) {
                    return data[i][nameCol]; // Return Name
                }
             }
        }
    } catch (e) {
        Logger.log("Error looking up name for ID " + empId + ": " + e);
    }
    return null;
}

function getAllSurveysReport() {
    try {
        Logger.log("getAllSurveysReport called");
        
        var userEmail = Session.getActiveUser().getEmail();
        Logger.log("User email: " + userEmail);
        
        var status = checkSurveyAdminStatus(userEmail); 
        Logger.log("Admin status: " + JSON.stringify(status));
        
        var isAdmin = status.isAdmin;
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Site_Visit_Database");
        if (!sheet) {
            Logger.log("ERROR: Sheet 'Site_Visit_Database' not found");
            return { orders: [], isAdmin: isAdmin, error: "Sheet 'Site_Visit_Database' not found" };
        }
        
        Logger.log("Sheet found: " + sheet.getName());
        
        var data = sheet.getDataRange().getValues();
        Logger.log("Total rows: " + data.length);
        
        if (data.length <= 1) {
            Logger.log("No data rows (only header or empty)");
            return { orders: [], isAdmin: isAdmin, debug: { message: "No data rows" } };
        }

        var headers = data[0];
        Logger.log("Headers: " + headers.join(", "));
        
        // Dynamic Header Mapping
        var h = {};
        for (var c = 0; c < headers.length; c++) {
            var key = String(headers[c]).trim();
            h[key] = c;
        }

        var results = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            
            // Helper to safe-get value
            function getVal(key) {
                var idx = h[key];
                return (idx !== undefined && idx < row.length) ? row[idx] : "";
            }

            // Skip empty rows (Check ID and Station using Dynamic Headers)
            var rowId = getVal("ID");
            var rowStation = getVal("Station");
            
            if (!rowId && !rowStation) continue;

            var obj = {};

            // Basic Mapping
            obj.timestamp = getVal("Timestamp");
            obj.id = rowId;
            obj.station = rowStation;
            obj.visitDate = getVal("Visit Date");
            obj.objective = getVal("Objective");
            obj.status = getVal("Status");

            // Full Data with Dynamic Mapping
            obj.fullData = {
                general: {
                    visitDate: getVal("Visit Date"), 
                    objective: getVal("Objective"), 
                    reOpen: getVal("Re-Open Date"), 
                    type: getVal("Branch Type"),
                    dm: getVal("DM Name"), 
                    cluster: getVal("Cluster Name"), 
                    sm: getVal("SM Name")
                },
                ee: { 
                    ee_meter: getVal("EE_Meter"), ee_panel: getVal("EE_Panel"), ee_lighting: getVal("EE_Lighting"), 
                    ee_emergency: getVal("EE_Emergency"), ee_cctv: getVal("EE_CCTV"), ee_ups: getVal("EE_UPS") 
                },
                ref: { 
                    ref_cdu1: getVal("Ref_CDU1"), ref_cdu2: getVal("Ref_CDU2"), ref_plugin: getVal("Ref_Plugin") 
                },
                ac: { 
                    ac_aircon: getVal("AC_Aircon"), ac_fans: getVal("AC_Fans") 
                },
                gen: { 
                    gen_microwave: getVal("Gen_Microwave"), gen_waterheater: getVal("Gen_WaterHeater"), gen_safe: getVal("Gen_Safe"), 
                    gen_fireext: getVal("Gen_FireExt"), gen_insect: getVal("Gen_Insect"), gen_toaster: getVal("Gen_Toaster"), gen_icefilter: getVal("Gen_IceFilter") 
                },
                const: { 
                    const_roof: getVal("Const_Roof"), const_wall: getVal("Const_Wall"), const_tile: getVal("Const_Tile"), 
                    const_ceiling: getVal("Const_Ceiling"), const_floor: getVal("Const_Floor"), const_drain: getVal("Const_Drain"), const_autodoor: getVal("Const_AutoDoor") 
                },
                pump: { 
                    pump_pump: getVal("Pump_Pump"), pump_toilet: getVal("Pump_Toilet"), pump_sink: getVal("Pump_Sink") 
                },
                ffe: {
                    ffe_shelving: getVal("FFE_Shelving"), ffe_display: getVal("FFE_Display"), ffe_counter: getVal("FFE_Counter"),
                    ffe_signage: getVal("FFE_Signage"), ffe_basket: getVal("FFE_Basket")
                },
                fnt: {
                    fnt_table: getVal("FNT_Table"), fnt_cabinet: getVal("FNT_Cabinet"), fnt_seating: getVal("FNT_Seating")
                },
                info: { 
                    energy: getVal("Energy Saving"), warranty: getVal("Warranty"), cms: getVal("CMS History") 
                },
                attachments: (function() {
                    try {
                        var json = getVal("Attachments_JSON");
                        if (!json) json = getVal("Attachments");
                        if (json && typeof json === 'string') return JSON.parse(json);
                        return {};
                    } catch (e) { return {}; }
                })(),
                quantities: (function() {
                    try {
                        var json = getVal("Quantities_JSON");
                        if (json && typeof json === 'string') return JSON.parse(json);
                        return {};
                    } catch(e) { return {}; }
                })(),
                followup: {
                    correctionStatus: getVal("Follow-up Correction Status") || "Not Started",
                    pmPlan: getVal("Follow-up PM Plan") || "Not Required",
                    notes: getVal("Follow-up Notes") || "",
                    date: getVal("Follow-up Date") || "",
                    by: getVal("Follow-up By") || ""
                },
                comments: {
                    ee: getVal("EE_Comment") || "",
                    ref: getVal("Ref_Comment") || "",
                    ac: getVal("AC_Comment") || "",
                    gen: getVal("Gen_Comment") || "",
                    const: getVal("Const_Comment") || "",
                    pump: getVal("Pump_Comment") || ""
                }
            };
            
            obj.recorderId = getVal("Recorder ID");
            
            results.push(obj);
        }
        
        Logger.log("Parsed " + results.length + " rows");
        
        // Resolve Names
        try {
            var empSheet = findEmployeeSheet();
            var empData = empSheet.getDataRange().getValues();
            var empMap = {};      
            for(var j=1; j<empData.length; j++) {
                if(empData[j][1]) empMap[String(empData[j][1])] = empData[j][2];
            }

            results.forEach(function(r) {
                r.recorderName = empMap[r.recorderId] || r.recorderId;
                // Format Dates Safely
                try {
                    if(r.timestamp && new Date(r.timestamp).toString() !== 'Invalid Date') {
                         r.timestamp = Utilities.formatDate(new Date(r.timestamp), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
                    }
                } catch(e) { r.timestamp = ""; }

                try {
                    if(r.visitDate && new Date(r.visitDate).toString() !== 'Invalid Date') {
                         r.visitDate = Utilities.formatDate(new Date(r.visitDate), Session.getScriptTimeZone(), "yyyy-MM-dd");
                    }
                } catch(e) { r.visitDate = ""; }
            });
        } catch(empError) {
            Logger.log("Error resolving employee names: " + empError.toString());
            // Continue without employee names
        }

        var result = { 
            orders: results.reverse(), 
            isAdmin: isAdmin,
            debug: {
                sheetName: sheet.getName(),
                totalRows: data.length,
                headersFound: Object.keys(h),
                // Don't include sampleRow/fullData in debug to keep it small strings
                rowCount: results.length
            }
        };
        
        Logger.log("Returning JSON string with " + result.orders.length + " orders");
        // Return as JSON string to avoid google.script.run serialization issues
        return JSON.stringify(result);

    } catch (e) {
        Logger.log("FATAL ERROR in getAllSurveysReport: " + e.toString());
        Logger.log("Stack: " + e.stack);
        
        return JSON.stringify({ 
            orders: [], 
            isAdmin: false,
            error: e.toString(),
            debug: {
                stack: e.stack,
                message: "Fatal error occurred"
            }
        });
    }
}

// Build a map { storeId -> { dmName, cmName, ammMtn } } from the store lookup spreadsheet.
// Used to back-fill DM Area / CM Area / AMM MTN on existing survey records that were
// submitted before the hidden inputs were wired up.
function _buildStoreEnrichMap() {
    // Re-use getStoreDBDataV2() which already has script-cache (key STORE_DB_LIST_V9).
    // This avoids a duplicate SpreadsheetApp.openByUrl() call and benefits from the
    // same 6-hour cache used by the front-end store lookup.
    try {
        var storeList = getStoreDBDataV2();
        var map = {};
        storeList.forEach(function(s) {
            var code = String(s.id || '').trim();
            if (!code) return;
            map[code] = {
                dmName: s.dmName  || '',
                cmName: s.cmName  || '',
                ammMtn: s.ammMtn  || ''
            };
        });
        return map;
    } catch(e) {
        Logger.log("_buildStoreEnrichMap error: " + e);
        return {};
    }
}

function getAirConSurveysReport() {
    try {
        Logger.log("getAirConSurveysReport called");
        
        var userEmail = Session.getActiveUser().getEmail();
        var status = checkSurveyAdminStatus(userEmail); 
        var isAdmin = status.isAdmin;
        var isSMF = status.isSMF;
        var isScheduleAdmin = status.isScheduleAdmin || false;
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        if (!sheet) {
            return JSON.stringify({ orders: [], isAdmin: isAdmin, isSMF: isSMF, isScheduleAdmin: isScheduleAdmin, error: "Sheet 'Aircon_Survey_Database' not found" });
        }
        
        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) {
            return JSON.stringify({ orders: [], isAdmin: isAdmin, isSMF: isSMF, isScheduleAdmin: isScheduleAdmin, debug: { message: "No data rows" } });
        }

        var headers = data[0];
        var h = {};
        for (var c = 0; c < headers.length; c++) {
            h[String(headers[c]).trim()] = c;
        }

        var results = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            
            function getVal(key) {
                var idx = h[key];
                return (idx !== undefined && idx < row.length) ? row[idx] : "";
            }

            var rowId = getVal("ID");
            if (!rowId) continue;

            var obj = {};

            obj.timestamp = getVal("Timestamp");
            obj.id = rowId;
            obj.station = getVal("Branch Code") + " - " + getVal("Branch Name");
            obj.visitDate = getVal("Timestamp");
            obj.objective = "Air Conditioner Survey";
            obj.status = getVal("Status") || "Pending";

            var reporterEmail = getVal("Reporter Email");
            obj.recorderEmail = reporterEmail;
            obj.recorderId = reporterEmail;
            obj.reporterName = getVal("Reporter Name");

            var acQty = parseInt(getVal("AC Quantity")) || 0;
            var units = [];
            for (var u = 1; u <= 20; u++) {
                var uBrand = getVal("Unit " + u + " Brand");
                var uType  = getVal("Unit " + u + " Type");
                var uAsset = getVal("Unit " + u + " Asset No");
                if (!uBrand && !uType && !uAsset) continue;
                units.push({
                    num:    u,
                    brand:  uBrand,
                    type:   uType,
                    assetNo: uAsset,
                    unitStatus: getVal("Unit " + u + " Status") || "ใช้งาน",
                    filter:    getVal("Filter Cleanliness " + u),
                    cooling:   getVal("Cooling Performance " + u),
                    drainage:  getVal("Drainage Leakage " + u),
                    noise:     getVal("Operational Noise " + u),
                    condition: getVal("Equipment Condition " + u),
                    note:      getVal("Unit " + u + " Note")
                });
            }

            obj.fullData = {
                general: {
                    visitDate: getVal("Timestamp"), 
                    objective: "Air Conditioner Survey",
                    type: "Air Conditioner",
                    dm: getVal("DM Area"),
                    cluster: getVal("CM Area"),
                    ammMtn: getVal("AMM MTN"),
                    acQuantity: getVal("AC Quantity"),
                    acBrand: getVal("AC Brand"),
                    brokenUnits: getVal("Broken Units"),
                    comments: getVal("Comments")
                },
                units: units,
                attachments: (function() {
                    try {
                        var json = getVal("Attachments_JSON");
                        if (json && typeof json === 'string') return JSON.parse(json);
                        return {};
                    } catch (e) { return {}; }
                })()
            };
            
            obj.dm      = (getVal("DM Area")  || '').trim();
            obj.cluster = (getVal("CM Area")  || '').trim();
            obj.ammMtn  = (getVal("AMM MTN")  || '').trim();
            results.push(obj);
        }
        
        // Resolve Names
        try {
            var empSheet = findEmployeeSheet();
            var empData = empSheet.getDataRange().getValues();
            var empMap = {};      
            for(var j=1; j<empData.length; j++) {
                if(empData[j][1]) empMap[String(empData[j][1])] = empData[j][2];
            }

            results.forEach(function(r) {
                r.recorderName = r.reporterName || empMap[r.recorderId] || r.recorderEmail || r.recorderId || "Unknown";
                
                try {
                    if(r.timestamp && new Date(r.timestamp).toString() !== 'Invalid Date') {
                         r.timestamp = Utilities.formatDate(new Date(r.timestamp), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
                    }
                } catch(e) { r.timestamp = ""; }

                try {
                    if(r.visitDate && new Date(r.visitDate).toString() !== 'Invalid Date') {
                         r.visitDate = Utilities.formatDate(new Date(r.visitDate), Session.getScriptTimeZone(), "yyyy-MM-dd");
                    }
                } catch(e) { r.visitDate = ""; }
            });
        } catch(empError) {
            results.forEach(function(r) {
                 r.recorderName = r.reporterName || r.recorderEmail || r.recorderId || "Unknown";
            });
        }

        // Enrich empty DM / CM / AMM MTN from store lookup (back-fills existing records)
        try {
            var storeMapAC = _buildStoreEnrichMap();
            results.forEach(function(r) {
                // Branch code is embedded in r.station as "CODE - Name"
                var code = r.station ? String(r.station).split(' - ')[0].trim() : '';
                if (code && storeMapAC[code]) {
                    var s = storeMapAC[code];
                    if (!r.dm)      r.dm      = s.dmName;
                    if (!r.cluster) r.cluster = s.cmName;
                    if (!r.ammMtn)  r.ammMtn  = s.ammMtn;
                    if (r.fullData && r.fullData.general) {
                        if (!r.fullData.general.dm)      r.fullData.general.dm      = s.dmName;
                        if (!r.fullData.general.cluster) r.fullData.general.cluster = s.cmName;
                        if (!r.fullData.general.ammMtn)  r.fullData.general.ammMtn  = s.ammMtn;
                    }
                }
            });
        } catch(enrichErrAC) { Logger.log("AC enrich error: " + enrichErrAC); }

        var result = { 
            orders: results.reverse(), 
            isAdmin: isAdmin,
            isSMF: isSMF,
            isScheduleAdmin: isScheduleAdmin,
            debug: { rowCount: results.length }
        };
        
        return JSON.stringify(result);

    } catch (e) {
        return JSON.stringify({ orders: [], isAdmin: false, error: e.toString() });
    }
}

// ─── AC Slim cache invalidation ──────────────────────────────────────────────
function _invalidateAcSlimCache() {
    try {
        var cache = CacheService.getScriptCache();
        var nStr = cache.get('AC_SLIM_V1_n');
        var keys = ['AC_SLIM_V1_n', 'COMBINED_TREND_V1'];
        if (nStr) { for (var i = 0; i < parseInt(nStr, 10); i++) keys.push('AC_SLIM_V1_' + i); }
        cache.removeAll(keys);
    } catch(e) {}
}

function getAirconSurveyListSlim() {
    try {
        // Cache check FIRST — before any sheet/auth reads
        try {
            var _sc = CacheService.getScriptCache();
            var _nStr = _sc.get('AC_SLIM_V1_n');
            if (_nStr !== null) {
                var _n = parseInt(_nStr, 10), _json = '', _ok = true;
                for (var _ci = 0; _ci < _n; _ci++) {
                    var _ch = _sc.get('AC_SLIM_V1_' + _ci);
                    if (_ch === null) { _ok = false; break; }
                    _json += _ch;
                }
                if (_ok) return { success: true, data: JSON.parse(_json), isAdmin: false, isSMF: false, isScheduleAdmin: false };
            }
        } catch(_scE) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Aircon_Survey_Database');
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [], isAdmin: false, isSMF: false, isScheduleAdmin: false };

        var lastCol = sheet.getLastColumn();
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var h = {};
        headers.forEach(function(hdr, i) { h[String(hdr).trim()] = i; });

        // Read only up to the furthest needed column (excludes Attachments_JSON and unit detail cols)
        var NEED = ['ID','Timestamp','Branch Code','Branch Name','Reporter Name','Reporter Email','Status','Broken Units','DM Area','CM Area','AMM MTN'];
        var maxIdx = -1;
        NEED.forEach(function(k) { if (h[k] !== undefined && h[k] > maxIdx) maxIdx = h[k]; });
        if (maxIdx < 0) return { success: true, data: [], isAdmin: false, isSMF: false, isScheduleAdmin: false };

        var nRows = sheet.getLastRow() - 1;
        var data = sheet.getRange(2, 1, nRows, maxIdx + 1).getValues();

        var results = [];
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var gv = function(k) { return h[k] !== undefined && h[k] <= maxIdx ? row[h[k]] : ''; };
            var id = gv('ID'); if (!id) continue;
            var ts = gv('Timestamp');
            if (ts instanceof Date) ts = ts.toISOString();
            results.push({
                id: String(id),
                timestamp: ts,
                station: String(gv('Branch Code') || '') + ' - ' + String(gv('Branch Name') || ''),
                dm:          String(gv('DM Area')       || '').trim(),
                cluster:     String(gv('CM Area')       || '').trim(),
                ammMtn:      String(gv('AMM MTN')       || '').trim(),
                recorderName: String(gv('Reporter Name') || gv('Reporter Email') || ''),
                status:      String(gv('Status')        || 'Pending'),
                brokenUnits: String(gv('Broken Units')  || '')
            });
        }

        // Store enrichment only if store DB already in script cache (avoid cold-open penalty)
        try {
            if (CacheService.getScriptCache().get('STORE_DB_LIST_V9')) {
                var sMap = _buildStoreEnrichMap();
                results.forEach(function(r) {
                    var code = r.station.split(' - ')[0].trim();
                    if (code && sMap[code]) {
                        if (!r.dm)      r.dm      = sMap[code].dmName  || '';
                        if (!r.cluster) r.cluster = sMap[code].cmName  || '';
                        if (!r.ammMtn)  r.ammMtn  = sMap[code].ammMtn  || '';
                    }
                });
            }
        } catch(e) {}

        results.reverse();

        // Write to 5-minute script cache (chunked to stay under 100KB/key limit)
        try {
            var _cj = JSON.stringify(results), _co = CacheService.getScriptCache();
            var _store = {}, _nc = 0;
            for (var _cs = 0; _cs < _cj.length; _cs += 90000)
                _store['AC_SLIM_V1_' + _nc++] = _cj.substring(_cs, _cs + 90000);
            _store['AC_SLIM_V1_n'] = String(_nc);
            _co.putAll(_store, 300);
        } catch(_we) {}

        return { success: true, data: results, isAdmin: false, isSMF: false, isScheduleAdmin: false };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

function getAirconSurveyRecordById(id) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Aircon_Survey_Database');
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var h = {};
        headers.forEach(function(hdr, i) { h[String(hdr).trim()] = i; });
        var idIdx = h['ID'];
        if (idIdx === undefined) return { success: false, error: 'ID column not found' };

        for (var i = 1; i < data.length; i++) {
            if (String(data[i][idIdx]) !== String(id)) continue;
            var row = data[i];
            var gv = function(k) { return h[k] !== undefined ? row[h[k]] : ''; };
            var ts = gv('Timestamp');
            if (ts instanceof Date) ts = ts.toISOString();
            var units = [];
            for (var u = 1; u <= 20; u++) {
                var uBrand = gv('Unit ' + u + ' Brand'), uType = gv('Unit ' + u + ' Type'), uAsset = gv('Unit ' + u + ' Asset No');
                if (!uBrand && !uType && !uAsset) continue;
                units.push({ num: u, brand: uBrand, type: uType, assetNo: uAsset,
                    unitStatus: gv('Unit ' + u + ' Status') || 'ใช้งาน',
                    filter:    gv('Filter Cleanliness ' + u),
                    cooling:   gv('Cooling Performance ' + u),
                    drainage:  gv('Drainage Leakage ' + u),
                    noise:     gv('Operational Noise ' + u),
                    condition: gv('Equipment Condition ' + u),
                    note:      gv('Unit ' + u + ' Note')
                });
            }
            var att = {};
            try { att = JSON.parse(gv('Attachments_JSON') || '{}'); } catch(e) {}
            var branchCode = String(gv('Branch Code') || '');
            var station    = branchCode + ' - ' + String(gv('Branch Name') || '');
            var dm      = String(gv('DM Area')  || '').trim();
            var cluster = String(gv('CM Area')  || '').trim();
            var ammMtn  = String(gv('AMM MTN')  || '').trim();
            var brokenUnits = String(gv('Broken Units') || '');
            return { success: true, data: {
                id: String(id), timestamp: ts, station: station,
                dm: dm, cluster: cluster, ammMtn: ammMtn,
                recorderName: String(gv('Reporter Name') || gv('Reporter Email') || ''),
                status: String(gv('Status') || 'Pending'),
                brokenUnits: brokenUnits,
                fullData: {
                    general: {
                        visitDate: ts, dm: dm, cluster: cluster, ammMtn: ammMtn,
                        acQuantity: gv('AC Quantity'), acBrand: gv('AC Brand'),
                        brokenUnits: brokenUnits, comments: gv('Comments')
                    },
                    units: units,
                    attachments: att
                }
            }};
        }
        return { success: false, error: 'Record not found' };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

function updateSurvey(form) {
    // Updating Status for either Survey or Aircon and maybe follow-up fields
    try {
        // Permission check: only admins and SMF team members can update status
        var authCheck = checkSurveyAdminStatus(form.clientEmail || Session.getActiveUser().getEmail());
        if (!authCheck.isAdmin && !authCheck.isSMF) {
            return { success: false, error: "Permission denied. Admin or SMF team required." };
        }
        var actionUser = authCheck.email || Session.getActiveUser().getEmail();

        var dbName = "Site_Visit_Database";
        if (form.databaseType === "Aircon") {
            dbName = "Aircon_Survey_Database";
        }
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(dbName);
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find Column Indices
        var colMap = {};
        for(var c=0; c<headers.length; c++) {
            colMap[String(headers[c]).trim()] = c + 1; // 1-based index for getRange
        }

        // Ensure Comment Headers Exist (Migration Helper)
        var newHeaders = ["EE_Comment", "Ref_Comment", "AC_Comment", "Gen_Comment", "Const_Comment", "Pump_Comment"];
        var headersAdded = false;
        newHeaders.forEach(function(h_name) {
            if (!colMap[h_name]) {
                var newCol = headers.length + 1;
                sheet.getRange(1, newCol).setValue(h_name);
                colMap[h_name] = newCol;
                headers.push(h_name); // Update local headers array
                headersAdded = true;
            }
        });
        
        // Helper to get col index
        function getCol(name) { return colMap[name]; }

        var rowIndex = -1;
        // Find ID Column Index
        var idColIdx = colMap["ID"] ? colMap["ID"] - 1 : 1; // 0-based for data array

        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == form.id) {
                rowIndex = i + 1;
                break;
            }
        }

        if (rowIndex > 0) {
            // Update Status
            var statusCol = getCol("Status");
            if (statusCol && form.status) sheet.getRange(rowIndex, statusCol).setValue(form.status);
            
            if (form.status == 'Acknowledged') {
                var user = actionUser;
                var ackByCol = getCol("Acknowledged By");
                var ackDateCol = getCol("Acknowledge Date");
                
                if (ackByCol) sheet.getRange(rowIndex, ackByCol).setValue(user);
                if (ackDateCol) sheet.getRange(rowIndex, ackDateCol).setValue(new Date());

                // Auto-mark branch as Uploaded in Upload_Schedule (Aircon only)
                if (form.databaseType === 'Aircon') {
                    try {
                        var bcColAc = (colMap['Branch Code'] || 0) - 1;
                        var branchCodeAc = bcColAc >= 0 ? String(data[rowIndex - 1][bcColAc]).trim() : '';
                        if (branchCodeAc) markBranchUploaded(branchCodeAc);
                    } catch (ignoreAc) { Logger.log('markBranchUploaded error: ' + ignoreAc); }
                }
            } else if (form.status == 'Corrected') {
                var user = actionUser;
                var corrByCol = getCol("Corrected By");
                var corrDateCol = getCol("Corrected Date");
                if (corrByCol) sheet.getRange(rowIndex, corrByCol).setValue(user);
                if (corrDateCol) sheet.getRange(rowIndex, corrDateCol).setValue(new Date());
            } else if (form.status == 'Closed') {
                var user = actionUser;
                var closedByCol = getCol("Closed By");
                var closedDateCol = getCol("Closed Date");
                if (closedByCol) sheet.getRange(rowIndex, closedByCol).setValue(user);
                if (closedDateCol) sheet.getRange(rowIndex, closedDateCol).setValue(new Date());
            } else if (form.status == 'Rejected') {
                var rejectedByCol  = getCol("Rejected By");
                var rejectedDateCol = getCol("Rejected Date");
                var rejectReasonCol = getCol("Reject Reason");
                if (rejectedByCol)  sheet.getRange(rowIndex, rejectedByCol).setValue(actionUser);
                if (rejectedDateCol) sheet.getRange(rowIndex, rejectedDateCol).setValue(new Date());
                if (rejectReasonCol && form.rejectReason) sheet.getRange(rowIndex, rejectReasonCol).setValue(form.rejectReason);
            }
            
            // Update Follow-up Fields
            if (form.followupCorrectionStatus !== undefined) {
                var correctionCol = getCol("Follow-up Correction Status");
                if (correctionCol) sheet.getRange(rowIndex, correctionCol).setValue(form.followupCorrectionStatus);
            }
            
            if (form.followupPmPlan !== undefined) {
                var pmPlanCol = getCol("Follow-up PM Plan");
                if (pmPlanCol) sheet.getRange(rowIndex, pmPlanCol).setValue(form.followupPmPlan);
            }
            
            if (form.followupNotes !== undefined) {
                var notesCol = getCol("Follow-up Notes");
                if (notesCol) sheet.getRange(rowIndex, notesCol).setValue(form.followupNotes);
            }
            
            // Auto-update Follow-up Date and By if any follow-up field changed
            if (form.followupCorrectionStatus !== undefined || form.followupPmPlan !== undefined || form.followupNotes !== undefined) {
                var currentUser = actionUser;
                var followupDateCol = getCol("Follow-up Date");
                var followupByCol = getCol("Follow-up By");
                
                if (followupDateCol) sheet.getRange(rowIndex, followupDateCol).setValue(new Date());
                if (followupByCol) sheet.getRange(rowIndex, followupByCol).setValue(currentUser);
            }

            // Update Comments
            var commentFields = {
                "eeComments": "EE_Comment",
                "refComments": "Ref_Comment",
                "acComments": "AC_Comment",
                "genComments": "Gen_Comment",
                "constComments": "Const_Comment",
                "pumpComments": "Pump_Comment"
            };

            for (var formKey in commentFields) {
                if (form[formKey] !== undefined) {
                    var headerName = commentFields[formKey];
                    var colIdx = getCol(headerName);
                    
                    // If column doesn't exist, we might need to create it or skip
                    // For now, assuming headers exist or will be added manually/by processForm
                    // But to be safe, let's try to handle it if we can find the header
                    if (colIdx) {
                        sheet.getRange(rowIndex, colIdx).setValue(form[formKey]);
                    } else {
                        // Optional: Create column logic if needed, but it's risky mid-operation without full header re-read
                        // For this implementation, we rely on the column existing. 
                        // To ensure it exists, user might need to add it or we add a check at start.
                        // Let's add a quick check at the start of updateSurvey to ensure headers exist.
                    }
                }
            }
            
            if (form.databaseType === 'Aircon') _invalidateAcSlimCache();
            return { success: true };
        }
         return { success: false, error: "Not Found" };
    } catch(e) {
         return { success: false, error: e.toString() };
    }
}

function resendSurveyEmail(reportId) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Site_Visit_Database");
        if (!sheet) {
            return { success: false, error: "Sheet not found" };
        }
        
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find the report row
        var rowIndex = -1;
        var idColIdx = -1;
        
        for (var h = 0; h < headers.length; h++) {
            if (String(headers[h]).trim() === "ID") {
                idColIdx = h;
                break;
            }
        }
        
        if (idColIdx === -1) {
            return { success: false, error: "ID column not found" };
        }
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] === reportId) {
                rowIndex = i;
                break;
            }
        }
        
        if (rowIndex === -1) {
            return { success: false, error: "Report not found" };
        }
        
        // Build form object from row data
        var row = data[rowIndex];
        var form = {};
        
        // Map header to values
        for (var j = 0; j < headers.length; j++) {
            var headerName = String(headers[j]).trim();
            form[headerName] = row[j];
        }
        
        // Extract key fields
        var reportForm = {
            empId: form["Recorder ID"] || "",
            station: form["Station"] || "",
            visitDate: form["Visit Date"] || "",
            objective: form["Objective"] || "",
            reOpenDate: form["Re-Open Date"] || "",
            branchType: form["Branch Type"] || "",
            dmName: form["DM Name"] || "",
            clusterName: form["Cluster Name"] || "",
            smName: form["SM Name"] || "",
            energySaving: form["Energy Saving"] || "",
            warranty: form["Warranty"] || "",
            cmsHistory: form["CMS History"] || "",
            
            // Map all checklist items
            ee_meter: form["EE_Meter"] || "",
            ee_panel: form["EE_Panel"] || "",
            ee_lighting: form["EE_Lighting"] || "",
            ee_emergency: form["EE_Emergency"] || "",
            ee_cctv: form["EE_CCTV"] || "",
            ee_ups: form["EE_UPS"] || "",
            ref_cdu1: form["Ref_CDU1"] || "",
            ref_cdu2: form["Ref_CDU2"] || "",
            ref_plugin: form["Ref_Plugin"] || "",
            ac_aircon: form["AC_Aircon"] || "",
            ac_fans: form["AC_Fans"] || "",
            gen_microwave: form["Gen_Microwave"] || "",
            gen_waterheater: form["Gen_WaterHeater"] || "",
            gen_safe: form["Gen_Safe"] || "",
            gen_fireext: form["Gen_FireExt"] || "",
            gen_insect: form["Gen_Insect"] || "",
            gen_toaster: form["Gen_Toaster"] || "",
            gen_icefilter: form["Gen_IceFilter"] || "",
            const_roof: form["Const_Roof"] || "",
            const_wall: form["Const_Wall"] || "",
            const_tile: form["Const_Tile"] || "",
            const_ceiling: form["Const_Ceiling"] || "",
            const_floor: form["Const_Floor"] || "",
            const_drain: form["Const_Drain"] || "",
            const_autodoor: form["Const_AutoDoor"] || "",
            pump_pump: form["Pump_Pump"] || "",
            pump_toilet: form["Pump_Toilet"] || "",
            pump_sink: form["Pump_Sink"] || "",
            
            ccEmail1: form["CC Email 1"] || "",
            ccEmail2: form["CC Email 2"] || "",
            ccEmail3: form["CC Email 3"] || ""
        };
        
        // Parse attachments and quantities
        var attachmentLinks = {};
        var quantities = {};
        
        try {
            if (form["Attachments_JSON"]) {
                attachmentLinks = JSON.parse(form["Attachments_JSON"]);
            }
        } catch(e) {
            Logger.log("Error parsing attachments: " + e.toString());
        }
        
        try {
            if (form["Quantities_JSON"]) {
                quantities = JSON.parse(form["Quantities_JSON"]);
            }
        } catch(e) {
            Logger.log("Error parsing quantities: " + e.toString());
        }
        
        // Send Email
        try {
            var recipients = [];
            
            // 1. Get Recorder Email
            var recorderEmail = "";
            try {
                var empSheet = findEmployeeSheet();
                if (empSheet) {
                    var empData = empSheet.getDataRange().getValues();
                    for (var k = 1; k < empData.length; k++) {
                        if (String(empData[k][1]) === String(reportForm.empId)) {
                            recorderEmail = empData[k][6];
                            break;
                        }
                    }
                }
            } catch(e) {}
            if (recorderEmail) recipients.push(recorderEmail);
            
            // 2. Lookup DM Email
            var dmEmail = findEmailByName(reportForm.dmName);
            if (dmEmail) recipients.push(dmEmail);
            
            // 3. Lookup SM Email
            var smEmail = findEmailByName(reportForm.smName);
            if (smEmail) recipients.push(smEmail);
            
            // 4. Add CC Emails
            if (reportForm.ccEmail1) recipients.push(reportForm.ccEmail1);
            if (reportForm.ccEmail2) recipients.push(reportForm.ccEmail2);
            if (reportForm.ccEmail3) recipients.push(reportForm.ccEmail3);
            
            // 5. Add all SMF and MMS emails from Note column in Employee_Database
            try {
                var empSheet = findEmployeeSheet();
                if (empSheet) {
                    var empData = empSheet.getDataRange().getValues();
                    var headers = empData[0];
                    var noteColIndex = -1;
                    
                    for (var h = 0; h < headers.length; h++) {
                        var headerName = String(headers[h]).trim().toLowerCase();
                        if (headerName === "note" || headerName === "notes") {
                            noteColIndex = h;
                            break;
                        }
                    }
                    
                    if (noteColIndex > -1) {
                        for (var r = 1; r < empData.length; r++) {
                            var noteValue = empData[r][noteColIndex];
                            if (noteValue) {
                                var noteValueLower = String(noteValue).trim().toLowerCase();
                                if (noteValueLower === "smf" || noteValueLower === "mms") {
                                    var ccEmail = empData[r][6];
                                    if (ccEmail && String(ccEmail).indexOf("@") > -1) {
                                        recipients.push(String(ccEmail).trim());
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (smfErr) {
                Logger.log("Error fetching SMF/MMS emails: " + smfErr.toString());
            }
            
            // Remove duplicates and filter empty
            recipients = recipients.filter(function(item, pos) {
                return recipients.indexOf(item) == pos && item;
            });
            
            if (recipients.length > 0) {
                var subject = "[Site Visit Report - RESEND] " + reportForm.station + " - " + reportForm.visitDate;
                var htmlBody = generateEmailBody(reportForm, attachmentLinks, quantities);
                
                MailApp.sendEmail({
                    to: recipients.join(","),
                    subject: subject,
                    htmlBody: htmlBody
                });
                
                Logger.log("Email resent to: " + recipients.join(","));
                return { success: true, message: "Email sent to " + recipients.length + " recipients" };
            } else {
                return { success: false, error: "No recipients found" };
            }
            
        } catch (emailErr) {
            Logger.log("Error sending email: " + emailErr.toString());
            return { success: false, error: "Email sending failed: " + emailErr.toString() };
        }
        
    } catch (e) {
        Logger.log("Error in resendSurveyEmail: " + e.toString());
        return { success: false, error: e.toString() };
    }
}

// Get team workload statistics (Admin only)
function getTeamWorkloadStats(clientEmail, startDate, endDate) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        
        // Check admin status
        var adminCheck = checkSurveyAdminStatus(userEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
            return JSON.stringify({ error: "Access Denied: Admin only" });
        }
        
        // Parse date range if provided
        var filterStartDate = startDate ? new Date(startDate) : null;
        var filterEndDate = endDate ? new Date(endDate) : null;
        
        // Get employee data with teams
        var empSheet = findEmployeeSheet();
        if (!empSheet) {
            return JSON.stringify({ error: "Employee database not found" });
        }
        
        var empData = empSheet.getDataRange().getValues();
        var employeeMap = {}; // empId -> {name, team}
        
        // Build employee map (Column 1=ID, 2=Name, 3=Nickname, 14=Note/Team)
        for (var i = 1; i < empData.length; i++) {
            var empId = String(empData[i][1]).trim();
            var name = empData[i][2];
            var nickname = empData[i][3] || ""; // Column 3 is Nickname
            var team = empData[i][13] || "Other"; // Column 13 is Note (contains team: SMF, MMS, etc.)
            
            if (empId && name) {
                employeeMap[empId] = {
                    name: name,
                    nickname: nickname,
                    team: team,
                    tripCount: 0,  // Changed from siteVisits to tripCount
                    totalDistance: 0
                };
            }
        }
        
        // Haversine formula to calculate distance between two GPS points in kilometers
        function calculateDistance(lat1, lon1, lat2, lon2) {
            var R = 6371; // Radius of Earth in kilometers
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            var distance = R * c;
            return distance;
        }
        
        // Build store GPS lookup map with multiple matching strategies
        var storeGpsMap = {};
        var storesByPartialName = {}; // For fuzzy matching
        var storeSheet = findStoreSheet();
        if (storeSheet) {
            var storeData = storeSheet.getDataRange().getValues();
            // Column 2 = Store ID, Column 4 = Site Name (Eng), Column 27 = Latitude, Column 28 = Longitude
            for (var i = 1; i < storeData.length; i++) {
                var storeId = String(storeData[i][2]).trim(); // Store ID
                var siteName = String(storeData[i][4]).trim(); // Site Name (Eng)
                var lat = parseFloat(storeData[i][27]); // Latitude
                var lon = parseFloat(storeData[i][28]); // Longitude
                
                if (!isNaN(lat) && !isNaN(lon)) {
                    var gpsData = { lat: lat, lon: lon };
                    
                    // Store by Store ID (e.g., "21062")
                    if (storeId) {
                        storeGpsMap[storeId] = gpsData;
                        storeGpsMap[storeId.toLowerCase()] = gpsData;
                    }
                    
                    // Store by Site Name
                    if (siteName) {
                        storeGpsMap[siteName] = gpsData;
                        storeGpsMap[siteName.toLowerCase()] = gpsData;
                        
                        // Extract key words for partial matching (e.g., "BCM Nikom Navanakorn" -> "nikom", "navanakorn")
                        var words = siteName.toLowerCase().split(/\s+/);
                        for (var w = 0; w < words.length; w++) {
                            if (words[w].length > 3) { // Only meaningful words
                                if (!storesByPartialName[words[w]]) {
                                    storesByPartialName[words[w]] = [];
                                }
                                storesByPartialName[words[w]].push(gpsData);
                            }
                        }
                    }
                    
                    // Store by combined format (e.g., "21062 BCM Nikom Navanakorn")
                    if (storeId && siteName) {
                        var combined = storeId + " " + siteName;
                        storeGpsMap[combined] = gpsData;
                        storeGpsMap[combined.toLowerCase()] = gpsData;
                    }
                }
            }
            Logger.log("Loaded " + Object.keys(storeGpsMap).length + " store GPS entries");
        }
        
        // Helper function to find store GPS with fuzzy matching
        function findStoreGps(stationName) {
            if (!stationName) return null;
            
            // Try exact match
            if (storeGpsMap[stationName]) return storeGpsMap[stationName];
            
            // Try case-insensitive match
            var lowerStation = stationName.toLowerCase();
            if (storeGpsMap[lowerStation]) return storeGpsMap[lowerStation];
            
            // Try extracting store ID from beginning (e.g., "22529" from "22529 BCM Store")
            var storeIdMatch = stationName.match(/^(\d{5})/);
            if (storeIdMatch && storeGpsMap[storeIdMatch[1]]) {
                return storeGpsMap[storeIdMatch[1]];
            }
            
            // Try partial word matching
            var stationWords = lowerStation.split(/\s+/);
            for (var w = 0; w < stationWords.length; w++) {
                if (stationWords[w].length > 3 && storesByPartialName[stationWords[w]]) {
                    // Return first match
                    return storesByPartialName[stationWords[w]][0];
                }
            }
            
            return null;
        }

        
        // Default office location (Bangkok - adjust to your actual office coordinates)
        var officeLatitude = 13.7563;
        var officeLongitude = 100.5018;
        
        // Count trip plans and sum distances from Trip_Plan_Database
        var tripSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Trip_Plans");
        if (tripSheet) {
            var tripData = tripSheet.getDataRange().getValues();
            var empIdIdx = -1;
            var gpsIdx = -1;
            var distanceIdx = -1;
            var startDateIdx = -1;
            var stationIdx = -1;
            
            // Find columns
            for (var j = 0; j < tripData[0].length; j++) {
                var header = String(tripData[0][j]).trim().toLowerCase();
                if (header === "employee id") empIdIdx = j;
                if (header === "gps") gpsIdx = j;
                if (header === "estimated distance" || header === "distance") distanceIdx = j;
                if (header === "start date") startDateIdx = j;
                if (header === "station") stationIdx = j;
            }
            
            // Debug: Log column indices
            Logger.log("Column indices - Employee ID: " + empIdIdx + ", GPS: " + gpsIdx + ", Distance: " + distanceIdx + ", Start Date: " + startDateIdx + ", Station: " + stationIdx);
            
            // Process trips if we have at least employee ID column
            if (empIdIdx > -1) {
                // First pass: collect all trips by employee
                var employeeTrips = {}; // empId -> array of trips
                
                for (var i = 1; i < tripData.length; i++) {
                    var empId = String(tripData[i][empIdIdx]).trim();
                    var tripStartDate = startDateIdx > -1 ? tripData[i][startDateIdx] : null;
                    var stationName = stationIdx > -1 ? String(tripData[i][stationIdx]).trim() : "";
                    var distanceValue = distanceIdx > -1 ? tripData[i][distanceIdx] : null;
                    
                    // Apply date filter if provided
                    if (filterStartDate && filterEndDate && startDateIdx > -1 && tripStartDate) {
                        if (Object.prototype.toString.call(tripStartDate) === "[object Date]") {
                            if (tripStartDate < filterStartDate || tripStartDate > filterEndDate) {
                                continue; // Skip trips outside date range
                            }
                        } else {
                            continue; // Skip if no valid date
                        }
                    }
                    
                    if (empId && employeeMap[empId]) {
                        if (!employeeTrips[empId]) {
                            employeeTrips[empId] = [];
                        }
                        
                        employeeTrips[empId].push({
                            date: tripStartDate,
                            station: stationName,
                            estimatedDistance: parseFloat(distanceValue) || 0
                        });
                    }
                }
                
                // Second pass: calculate distances for each employee
                for (var empId in employeeTrips) {
                    var trips = employeeTrips[empId];
                    employeeMap[empId].tripCount = trips.length;
                    
                    var totalDistance = 0;
                    var hasEstimatedDistances = false;
                    
                    // Check if any trips have estimated distances
                    for (var j = 0; j < trips.length; j++) {
                        if (trips[j].estimatedDistance > 0) {
                            hasEstimatedDistances = true;
                            totalDistance += trips[j].estimatedDistance;
                        }
                    }
                    
                    // If no estimated distances, calculate point-to-point route
                    if (!hasEstimatedDistances && trips.length > 0) {
                        // Sort trips by date
                        trips.sort(function(a, b) {
                            if (!a.date || !b.date) return 0;
                            return a.date - b.date;
                        });
                        
                        var route = [];
                        var prevLat = null;
                        var prevLon = null;
                        
                        // Calculate distance from store to store (ignoring Head Office start)
                        for (var j = 0; j < trips.length; j++) {
                            var stationName = trips[j].station;
                            var storeGps = findStoreGps(stationName);
                            
                            if (storeGps) {
                                if (prevLat === null) {
                                    // First valid store is the starting point (Distance = 0)
                                    prevLat = storeGps.lat;
                                    prevLon = storeGps.lon;
                                    route.push(stationName + " (Start)");
                                } else {
                                    // Calculate distance from previous store to current store
                                    var segmentDistance = calculateDistance(prevLat, prevLon, storeGps.lat, storeGps.lon);
                                    totalDistance += segmentDistance;
                                    
                                    route.push(stationName);
                                    prevLat = storeGps.lat;
                                    prevLon = storeGps.lon;
                                }
                            } else {
                                Logger.log("Could not find GPS for station: '" + stationName + "'");
                            }
                        }
                        
                        if (route.length > 0) {
                            Logger.log("Employee " + empId + " route (" + trips.length + " trips): " + route.join(" → ") + " = " + totalDistance.toFixed(2) + " km");
                        }
                    }
                    
                    employeeMap[empId].totalDistance = totalDistance;
                }
            }
        }
        
        // Convert to array and sort by trip count
        var stats = [];
        for (var empId in employeeMap) {
            var emp = employeeMap[empId];
            stats.push({
                empId: empId,
                name: emp.name,
                nickname: emp.nickname,
                team: emp.team,
                tripCount: emp.tripCount,  // Changed from siteVisits
                totalDistance: Math.round(emp.totalDistance * 10) / 10 // Round to 1 decimal
            });
        }
        
        // Sort by trip count descending
        stats.sort(function(a, b) {
            return b.tripCount - a.tripCount;
        });
        
        return JSON.stringify({ stats: stats });
        
    } catch (e) {
        Logger.log("getTeamWorkloadStats error: " + e.toString());
        return JSON.stringify({ error: e.toString() });
    }
}

// --- Survey Configuration Functions ---

/**
 * Get survey checklist configuration from Survey_Config sheet
 * Returns array of active checklist items grouped by category
 */
function getSurveyConfig() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("Survey_Config");
        
        if (!sheet) {
            Logger.log("Survey_Config sheet not found");
            return [];
        }
        
        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) return []; // No data or just headers
        
        var headers = data[0];
        var categoryIdx = 0;  // Column A: Category
        var itemIdIdx = 1;    // Column B: Item_ID
        var labelThIdx = 2;   // Column C: Label_TH
        var labelEnIdx = 3;   // Column D: Label_EN
        var activeIdx = 4;    // Column E: Active
        var sortOrderIdx = 5; // Column F: Sort_Order
        
        var config = {};
        
        // Process each row
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var category = String(row[categoryIdx]).trim();
            var itemId = String(row[itemIdIdx]).trim();
            var labelTh = String(row[labelThIdx]).trim();
            var labelEn = String(row[labelEnIdx]).trim();
            var active = row[activeIdx];
            var sortOrder = row[sortOrderIdx] || 999;
            
            // Skip inactive items or empty rows
            if (!active || active.toString().toLowerCase() !== 'true' || !category || !itemId) {
                continue;
            }
            
            // Initialize category array if needed
            if (!config[category]) {
                config[category] = [];
            }
            
            config[category].push({
                itemId: itemId,
                labelTh: labelTh,
                labelEn: labelEn,
                sortOrder: sortOrder
            });
        }
        
        // Sort items within each category by sortOrder
        for (var cat in config) {
            config[cat].sort(function(a, b) {
                return a.sortOrder - b.sortOrder;
            });
        }
        
        return config;
        
    } catch (e) {
        Logger.log("getSurveyConfig error: " + e.toString());
        return {};
    }
}

/**
 * Get survey objective options from Survey_Objectives sheet
 * Returns array of active objective options sorted by Sort_Order
 */
function getSurveyObjectives() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("Survey_Objectives");
        
        if (!sheet) {
            Logger.log("Survey_Objectives sheet not found");
            return [];
        }
        
        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) return []; // No data or just headers
        
        var headers = data[0];
        var valueIdx = 0;     // Column A: Value
        var labelIdx = 1;     // Column B: Label
        var activeIdx = 2;    // Column C: Active
        var sortOrderIdx = 3; // Column D: Sort_Order
        
        var objectives = [];
        
        // Process each row
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var value = String(row[valueIdx]).trim();
            var label = String(row[labelIdx]).trim();
            var active = row[activeIdx];
            var sortOrder = row[sortOrderIdx] || 999;
            
            // Skip inactive items or empty rows
            if (!active || active.toString().toLowerCase() !== 'true' || !value) {
                continue;
            }
            
            objectives.push({
                value: value,
                label: label,
                sortOrder: sortOrder
            });
        }
        
        // Sort by sortOrder
        objectives.sort(function(a, b) {
            return a.sortOrder - b.sortOrder;
        });
        
        return objectives;
        
    } catch (e) {
        Logger.log("getSurveyObjectives error: " + e.toString());
        return [];
    }
}

function deleteSurvey(params) {
    try {
        // Prefer clientEmail passed from browser (Session.getActiveUser() returns empty in web app context)
        var userEmail = (typeof params === 'object' && params.clientEmail)
            ? params.clientEmail
            : Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail); 
        
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
             return { success: false, error: "Access Denied. Administrator privileges required." };
        }
        
        var idToDelete = typeof params === 'object' ? params.id : params;
        var dbName = "Site_Visit_Database";
        
        // If it's the new Aircon database
        if (typeof params === 'object' && params.databaseType === "Aircon") {
            dbName = "Aircon_Survey_Database";
        }
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(dbName);
        if (!sheet) return { success: false, error: "Database sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) return { success: false, error: "Database empty" };
        
        var headers = data[0];
        
        // Find ID column index
        var idColIdx = -1;
        for (var c = 0; c < headers.length; c++) {
            if (headers[c] === "ID" || String(headers[c]).trim() === "ID") {
                idColIdx = c;
                break;
            }
        }
        
        if (idColIdx === -1) {
            return { success: false, error: "ID column not found in database" };
        }
        
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == idToDelete) {
                rowIndex = i + 1; // 1-based index for getRange/deleteRow
                break;
            }
        }
        
        if (rowIndex > 0) {
            sheet.deleteRow(rowIndex);
            if (typeof params === 'object' && params.databaseType === 'Aircon') _invalidateAcSlimCache();
            else _invalidateRefSlimCache();
            return { success: true };
        }
        
        return { success: false, error: "Report ID not found" };
        
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}


// Alias used by AirconSurveyReport.html
function deleteReport(params) {
    return deleteSurvey(params);
}

// ============================================================
// REFRIGERATOR SURVEY
// ============================================================

function processRefSurveyForm(form) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");

        var id = "RFS-" + new Date().getTime();

        // Handle Attachments
        var attachmentLinks = {};
        if (form.attachments) {
            var folderName = "Ref_Survey_Attachments";
            var folder;
            var folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(folderName); }

            for (var category in form.attachments) {
                var files = form.attachments[category];
                if (files && files.length > 0) {
                    attachmentLinks[category] = [];
                    files.forEach(function(fileData) {
                        var filename = id + "_" + category + "_" + fileData.name;
                        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
                        var file = folder.createFile(blob);
                        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                        attachmentLinks[category].push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    });
                }
            }
        }

        // Build per-unit broken refrigerator data (new format: brokenRefUnit + RefUnitN_*)
        var brokenUnitNumbers = form.brokenRefUnit || "";
        var brokenUnitDetail = {};
        var unitNumList = brokenUnitNumbers.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        unitNumList.forEach(function(n) {
            var ni = parseInt(n);
            brokenUnitDetail["unit" + ni] = {
                type:        form["RefUnit" + ni + "_Type"]       || "",
                assetNo:     form["RefUnit" + ni + "_AssetNo"]    || "",
                temp:        form["RefUnit" + ni + "_Temp"]       || "",
                frost:       form["RefUnit" + ni + "_Frost"]      || "",
                compressor:  form["RefUnit" + ni + "_Compressor"] || "",
                evapFan:     form["RefUnit" + ni + "_EvapFan"]    || "",
                condFan:     form["RefUnit" + ni + "_CondFan"]    || "",
                gasket:      form["RefUnit" + ni + "_Gasket"]     || "",
                drain:       form["RefUnit" + ni + "_Drain"]      || "",
                refrigerant: form["RefUnit" + ni + "_Refrigerant"]|| "",
                condenser:   form["RefUnit" + ni + "_Condenser"]  || "",
                controller:  form["RefUnit" + ni + "_Controller"] || "",
                note:        form["RefUnit" + ni + "_Note"]       || ""
            };
        });

        var dataToSave = {
            "Timestamp":           new Date(),
            "ID":                  id,
            "Reporter Email":      form.reporterEmail || "",
            "Reporter Name":       form.reporterName || "",
            "Branch Code":         form.branchCode || "",
            "Branch Name":         form.branchName || "",
            // ชำรุด (new per-unit format)
            "Has Broken Ref":       form.hasBrokenRef || "No",
            "Broken Units":         brokenUnitNumbers,
            "Broken Units Detail":  JSON.stringify(brokenUnitDetail),
            "Comments":            form.comments || "",
            "DM Area":             form.dmArea || "",
            "CM Area":             form.cmArea || "",
            "AMM MTN":             form.ammMtn || "",
            "Status":              form.isDraft ? "Draft" : "Pending",
            "Attachments_JSON":    JSON.stringify(attachmentLinks)
        };

        // Dynamically append all "ref" prefixed form inputs (e.g. refOpenQty, refOpenBrand_1, refBevProduct_2)
        Object.keys(form).forEach(function(key) {
            if (key.indexOf("ref") === 0) {
                // To make headers cleaner, space out camelCase
                var cleanHeaders = key.replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase(); });
                dataToSave[cleanHeaders] = form[key];
            }
        });

        // Ensure sheet & headers exist
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Ref_Survey_Database");
            sheet.appendRow(Object.keys(dataToSave));
        }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        Object.keys(dataToSave).forEach(function(key) {
            if (headers.indexOf(key) === -1) {
                headers.push(key);
                sheet.getRange(1, headers.length).setValue(key);
            }
        });

        var row = headers.map(function(h) { return dataToSave[h] !== undefined ? dataToSave[h] : ""; });
        sheet.appendRow(row);
        _invalidateRefSlimCache();

        // Email Notification
        if (!form.isDraft) {
        try {
            var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
            var ccEmails = [];
            if (form.ccEmail1) ccEmails.push(form.ccEmail1.trim().toLowerCase());
            if (form.ccEmail2) ccEmails.push(form.ccEmail2.trim().toLowerCase());
            ccEmails = ccEmails.filter(function(e, i, a) { return e && e !== toEmail && a.indexOf(e) === i; });

            var htmlBody = '<html><body style="font-family:sans-serif;color:#333;background:#f4f4f4;margin:0;padding:0;">';
            htmlBody += '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">';
            htmlBody += '<div style="background:#0369a1;color:white;padding:20px;text-align:center;">';
            htmlBody += '<h2 style="margin:0 0 8px 0;">Refrigerator Survey Report</h2>';
            htmlBody += '<p style="margin:0;font-size:14px;">Branch: ' + form.branchCode + ' - ' + form.branchName + '</p>';
            htmlBody += '</div><div style="padding:20px;">';
            htmlBody += '<p><b>Reporter:</b> ' + (form.reporterName || toEmail) + '</p>';
            htmlBody += '<hr/>';
            htmlBody += '<h3>สรุปจำนวนตู้แช่รวม</h3>';
            htmlBody += '<p><b>OPEN:</b> ' + (form.refOpenQty || 0) + ' ตู้</p>';
            htmlBody += '<p><b>ตู้แช่เย็นบานกระจก:</b> Plugin ' + (form.refBevPluginQty || 0) + ' / Walk-in ' + (form.refBevWalkInQty || 0) + ' / Remote ' + (form.refBevRemoteQty || 0) + ' ตู้</p>';
            htmlBody += '<p><b>อาหารแช่แข็ง:</b> 1 ประตู ' + (form.refFrozen1DoorQty || 0) + ' / 2 ประตู ' + (form.refFrozen2DoorQty || 0) + ' / 3 ประตู ' + (form.refFrozen3DoorQty || 0) + ' ตู้</p>';
            htmlBody += '<p><b>ไอศกรีม:</b> ' + (form.refIceCreamQty || 0) + ' ตู้ | <b>น้ำแข็ง:</b> ' + (form.refIceQty || 0) + ' ตู้</p>';
            htmlBody += '<p><b>ตู้ 4 ประตู Stainless:</b> ' + (form.refSs4DoorQty || 0) + ' ตู้</p>';
            
            htmlBody += '<hr/><h3>รายละเอียดแต่ละตู้ (Brand, Asset No & Product)</h3>';

            // Helper: print unit rows for a given namePrefix and qty, starting at startIdx
            function unitRows(sectionLabel, prefixKey, qty, startIdx) {
                if (!qty || qty <= 0) return;
                var start = startIdx || 1;
                htmlBody += '<p style="margin:4px 0 2px 0;"><b>→ ' + sectionLabel + ' (' + qty + ' ตู้)</b></p>';
                for (var u = start; u < start + qty; u++) {
                    var supplier = dataToSave[prefixKey + 'Supplier_' + u] || '';
                    var supplierOther = dataToSave[prefixKey + 'Supplier Other_' + u] || '';
                    var supplierDisplay = supplier ? (supplier + (supplierOther ? ' (' + supplierOther + ')' : '')) : '';
                    var brand   = dataToSave[prefixKey + 'Brand_' + u]    || '-';
                    var asset   = dataToSave[prefixKey + 'Asset No_' + u] || '-';
                    var product = dataToSave[prefixKey + 'Product_' + u]  || '-';
                    var uStatus = dataToSave[prefixKey + 'Status_' + u]   || 'ใช้งาน';
                    var statusTag = uStatus === 'ใช้งาน'
                        ? '<span style="display:inline-block;padding:0 7px;border-radius:10px;background:#dcfce7;color:#15803d;border:1px solid #86efac;font-weight:700;font-size:11px;">✓ ใช้งาน</span>'
                        : '<span style="display:inline-block;padding:0 7px;border-radius:10px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:700;font-size:11px;">✗ ไม่ใช้งาน</span>';
                    var line = 'ตู้ที่ ' + (u - start + 1) + ': ';
                    if (supplierDisplay) line += 'แบรนด์ไอศกรีม=' + supplierDisplay + ' | ';
                    line += (supplierDisplay ? 'ยี่ห้อตู้=' : 'ยี่ห้อ=') + brand + ' | Asset=' + asset + ' | สินค้า=' + product + ' | สถานะ=' + statusTag;
                    htmlBody += '<p style="margin:0 0 0 12px;font-size:13px;">' + line + '</p>';
                }
            }

            var _f1 = parseInt(form.refFrozen1DoorQty) || 0;
            var _f2 = parseInt(form.refFrozen2DoorQty) || 0;
            var _f3 = parseInt(form.refFrozen3DoorQty) || 0;
            unitRows('2.1 OPEN', 'Ref Open ', parseInt(form.refOpenQty) || 0, 1);
            unitRows('2.2 Plugin', 'Ref Bev Plugin ', parseInt(form.refBevPluginQty) || 0, 1);
            unitRows('2.2 Walk-in', 'Ref Bev Walk In ', parseInt(form.refBevWalkInQty) || 0, 1);
            unitRows('2.2 Remote', 'Ref Bev Remote ', parseInt(form.refBevRemoteQty) || 0, 1);
            unitRows('2.3 ตู้แช่แข็ง 1 ประตู', 'Ref Frozen ', _f1, 1);
            unitRows('2.3 ตู้แช่แข็ง 2 ประตู', 'Ref Frozen ', _f2, _f1 + 1);
            unitRows('2.3 ตู้แช่แข็ง 3 ประตู', 'Ref Frozen ', _f3, _f1 + _f2 + 1);
            unitRows('2.4 ไอศกรีม', 'Ref Ice Cream ', parseInt(form.refIceCreamQty) || 0, 1);
            unitRows('2.5 น้ำแข็ง', 'Ref Ice ', parseInt(form.refIceQty) || 0, 1);
            unitRows('2.6 ตู้ 4 ประตู Stainless', 'Ref Ss4Door ', parseInt(form.refSs4DoorQty) || 0, 1);
            if (form.hasBrokenRef === 'Yes') {
                htmlBody += '<hr/><h3 style="color:red;">ตู้แช่ชำรุด</h3>';
                htmlBody += '<p><b>ตู้ที่ชำรุด:</b> ' + (brokenUnitNumbers || '-') + '</p>';
                unitNumList.forEach(function(n) {
                    var d = brokenUnitDetail['unit' + n];
                    if (!d) return;
                    htmlBody += '<div style="background:#fff8f8;border:1px solid #fecaca;border-radius:6px;padding:10px;margin-bottom:8px;">';
                    htmlBody += '<p style="margin:0 0 6px 0;"><b>ตู้ที่ ' + n + '</b> (' + (d.type || 'ไม่ระบุประเภท') + ')';
                    if (d.assetNo)    htmlBody += ' &nbsp;[Asset: ' + d.assetNo + ']';
                    htmlBody += '</p>';
                    var refChecks = [
                        ['อุณหภูมิ (Temp)', d.temp], ['น้ำแข็งสะสม (Frost)', d.frost],
                        ['คอมเพรสเซอร์ (Compressor)', d.compressor], ['พัดลมคอยล์เย็น (Evap Fan)', d.evapFan],
                        ['พัดลมคอนเดนเซอร์ (Cond Fan)', d.condFan], ['ขอบยางประตู (Gasket)', d.gasket],
                        ['ท่อระบาย (Drain)', d.drain], ['สารทำความเย็น (Refrigerant)', d.refrigerant],
                        ['คอนเดนเซอร์ (Condenser)', d.condenser], ['ระบบควบคุม (Controller)', d.controller]
                    ];
                    htmlBody += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
                    refChecks.forEach(function(c) {
                        if (!c[1]) return;
                        var color = c[1] === 'ผิดปกติ' ? '#b91c1c' : (c[1] === 'ไม่มี' ? '#6b7280' : '#15803d');
                        htmlBody += '<tr><td style="padding:2px 6px;color:#555;">' + c[0] + '</td><td style="padding:2px 6px;font-weight:bold;color:' + color + ';">' + c[1] + '</td></tr>';
                    });
                    htmlBody += '</table>';
                    if (d.note) htmlBody += '<p style="margin:6px 0 0 0;font-size:13px;"><b>หมายเหตุ:</b> ' + d.note + '</p>';
                    htmlBody += '</div>';
                });
            }
            if (form.comments) {
                htmlBody += '<hr/><h3>หมายเหตุ</h3><p>' + form.comments + '</p>';
            }

            htmlBody += '</div></div></body></html>';

            MailApp.sendEmail({
                to: toEmail,
                cc: ccEmails.join(","),
                subject: "[Ref Survey] " + form.branchCode + " - " + form.branchName,
                htmlBody: htmlBody
            });
        } catch (mailErr) {
            Logger.log("Email Error: " + mailErr.toString());
        }
        } // end if (!form.isDraft)

        return { success: true, id: id };

    } catch (e) {
        Logger.log("processRefSurveyForm Error: " + e.toString());
        return { success: false, error: e.toString() };
    }
}


// ─── Slim list: only essential columns ──────────────────────────────────────

function _invalidateRefSlimCache() {
    try {
        var cache = CacheService.getScriptCache();
        var nStr = cache.get('REF_SLIM_V1_n');
        var keys = ['REF_SLIM_V1_n', 'COMBINED_TREND_V1'];
        if (nStr) { for (var i = 0; i < parseInt(nStr, 10); i++) keys.push('REF_SLIM_V1_' + i); }
        cache.removeAll(keys);
    } catch(e) {}
}

// Run this from GAS Editor (▶ Run) to debug timing step-by-step.
function debugRefSlim() {
    var t0 = Date.now();
    Logger.log('=== debugRefSlim START ===');
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        Logger.log('getActiveSpreadsheet: ' + (Date.now()-t0) + 'ms');

        var sheet = ss.getSheetByName('Ref_Survey_Database');
        Logger.log('getSheetByName: ' + (Date.now()-t0) + 'ms | sheet=' + (sheet ? 'found' : 'NOT FOUND') + ' lastRow=' + (sheet ? sheet.getLastRow() : 'N/A') + ' lastCol=' + (sheet ? sheet.getLastColumn() : 'N/A'));
        if (!sheet || sheet.getLastRow() < 2) { Logger.log('No data - done'); return; }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        Logger.log('headers read: ' + (Date.now()-t0) + 'ms | colCount=' + headers.length);

        var LIST_KEYS = ['ID','Timestamp','Branch Code','Branch Name','Reporter Name','Reporter Email','Status','Has Broken Ref','Broken Units','DM Area','CM Area','AMM MTN'];
        var keyIdx = {};
        LIST_KEYS.forEach(function(k){ keyIdx[k] = headers.indexOf(k); });
        Logger.log('keyIdx: ' + JSON.stringify(keyIdx));

        var maxNeededIdx = -1;
        LIST_KEYS.forEach(function(k){ if (keyIdx[k] > maxNeededIdx) maxNeededIdx = keyIdx[k]; });
        Logger.log('maxNeededIdx=' + maxNeededIdx + ' (reading cols 1..' + (maxNeededIdx+1) + ')');

        var nRows = sheet.getLastRow() - 1;
        var dataRange = sheet.getRange(2, 1, nRows, maxNeededIdx + 1).getValues();
        Logger.log('dataRange read: ' + (Date.now()-t0) + 'ms | rows=' + dataRange.length);

        var results = [];
        for (var i = 0; i < dataRange.length; i++) {
            var row = dataRange[i];
            var slim = {};
            LIST_KEYS.forEach(function(k){ var idx = keyIdx[k]; slim[k] = idx > -1 ? row[idx] : ''; });
            if (slim['Timestamp'] instanceof Date) slim['Timestamp'] = slim['Timestamp'].toISOString();
            slim['_photoCount'] = 0;
            results.push(slim);
        }
        Logger.log('build results: ' + (Date.now()-t0) + 'ms | count=' + results.length);
        Logger.log('=== debugRefSlim DONE ' + (Date.now()-t0) + 'ms ===');
    } catch(e) {
        Logger.log('ERROR at ' + (Date.now()-t0) + 'ms: ' + e.toString() + '\n' + e.stack);
    }
}

function getRefSurveyListSlim() {
    try {
        // ── Cache hit: return immediately, no sheet reads at all ──────────────
        try {
            var _sc = CacheService.getScriptCache();
            var _nStr = _sc.get('REF_SLIM_V1_n');
            if (_nStr !== null) {
                var _n = parseInt(_nStr, 10), _json = '', _ok = true;
                for (var _ci = 0; _ci < _n; _ci++) {
                    var _ch = _sc.get('REF_SLIM_V1_' + _ci);
                    if (_ch === null) { _ok = false; break; }
                    _json += _ch;
                }
                if (_ok) return { success: true, data: JSON.parse(_json), isAdmin: false, isSMF: false, isScheduleAdmin: false };
            }
        } catch(_scE) {}
        // ─────────────────────────────────────────────────────────────────────

        // Cache miss: read ONLY the columns we need (not getDataRange).
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ref_Survey_Database');
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [], isAdmin: false, isSMF: false, isScheduleAdmin: false };

        var lastCol  = sheet.getLastColumn();
        var lastRow  = sheet.getLastRow();
        var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        var LIST_KEYS = ['ID','Timestamp','Branch Code','Branch Name','Reporter Name','Reporter Email','Status','Has Broken Ref','Broken Units','DM Area','CM Area','AMM MTN'];
        var keyIdx = {};
        LIST_KEYS.forEach(function(k) { keyIdx[k] = headers.indexOf(k); });

        var maxNeededIdx = -1;
        LIST_KEYS.forEach(function(k) { if (keyIdx[k] > maxNeededIdx) maxNeededIdx = keyIdx[k]; });
        if (maxNeededIdx < 0) return { success: true, data: [], isAdmin: false, isSMF: false, isScheduleAdmin: false };

        var nRows    = lastRow - 1;
        var dataRange = sheet.getRange(2, 1, nRows, maxNeededIdx + 1).getValues();

        var results = [];
        for (var i = 0; i < dataRange.length; i++) {
            var row = dataRange[i];
            var slim = {};
            LIST_KEYS.forEach(function(k) { var idx = keyIdx[k]; slim[k] = idx > -1 ? row[idx] : ''; });
            if (slim['Timestamp'] instanceof Date) slim['Timestamp'] = slim['Timestamp'].toISOString();
            slim['_photoCount'] = 0;
            results.push(slim);
        }
        results.reverse();

        // ── Write to 5-min cache (chunked, 90 KB max/key) ────────────────────
        try {
            var _cj = JSON.stringify(results);
            var _co = CacheService.getScriptCache();
            var _store = {}, _nc = 0;
            for (var _cs = 0; _cs < _cj.length; _cs += 90000) {
                _store['REF_SLIM_V1_' + _nc++] = _cj.substring(_cs, _cs + 90000);
            }
            _store['REF_SLIM_V1_n'] = String(_nc);
            _co.putAll(_store, 300);
        } catch(_we) {}

        return { success: true, data: results, isAdmin: false, isSMF: false, isScheduleAdmin: false };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Single full record by ID — used for lazy modal loading ──────────────────
function getRefSurveyRecordById(id) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ref_Survey_Database');
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var values = sheet.getDataRange().getValues();
        var headers = values[0];
        var idIdx = headers.indexOf('ID');
        if (idIdx === -1) return { success: false, error: 'ID column not found' };
        for (var i = 1; i < values.length; i++) {
            if (String(values[i][idIdx]) === String(id)) {
                var row = {};
                headers.forEach(function(h, idx) { row[h] = values[i][idx]; });
                try { row['Attachments_JSON'] = JSON.parse(row['Attachments_JSON'] || '{}'); } catch(e) { row['Attachments_JSON'] = {}; }
                if (row['Timestamp'] instanceof Date) row['Timestamp'] = row['Timestamp'].toISOString();
                return { success: true, data: row };
            }
        }
        return { success: false, error: 'Record not found' };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getRefSurveyReport() {
    try {
        var userEmail = Session.getActiveUser().getEmail();
        var authStatus = checkSurveyAdminStatus(userEmail);

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [], isAdmin: authStatus.isAdmin, isSMF: authStatus.isSMF, isScheduleAdmin: authStatus.isScheduleAdmin || false };

        var values = sheet.getDataRange().getValues();
        var headers = values[0];
        var results = [];

        for (var i = 1; i < values.length; i++) {
            var row = {};
            headers.forEach(function(h, idx) {
                row[h] = values[i][idx];
            });
            // Parse attachments
            try {
                row["Attachments_JSON"] = JSON.parse(row["Attachments_JSON"] || "{}");
            } catch (e) { row["Attachments_JSON"] = {}; }

            // Timestamp as ISO string
            if (row["Timestamp"] instanceof Date) row["Timestamp"] = row["Timestamp"].toISOString();
            results.push(row);
        }

        // Enrich empty DM / CM / AMM MTN from store lookup (back-fills existing records)
        try {
            var storeMapRef = _buildStoreEnrichMap();
            results.forEach(function(row) {
                var code = String(row["Branch Code"] || '').trim();
                if (code && storeMapRef[code]) {
                    var s = storeMapRef[code];
                    if (!String(row["DM Area"] || '').trim())  row["DM Area"]  = s.dmName;
                    if (!String(row["CM Area"] || '').trim())  row["CM Area"]  = s.cmName;
                    if (!String(row["AMM MTN"] || '').trim())  row["AMM MTN"]  = s.ammMtn;
                }
            });
        } catch(enrichErrRef) { Logger.log("Ref enrich error: " + enrichErrRef); }

        // Return latest first
        results.reverse();
        return { success: true, data: results, isAdmin: authStatus.isAdmin, isSMF: authStatus.isSMF, isScheduleAdmin: authStatus.isScheduleAdmin || false };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}


function updateRefSurveyStatus(id, newStatus, clientEmail, rejectReason) {
    try {
        var authCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!authCheck.isAdmin && !authCheck.isSMF) {
            return { success: false, error: "Permission denied. Admin or SMF team required." };
        }
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var values = sheet.getDataRange().getValues();
        var headers = values[0];
        var idCol = headers.indexOf("ID");
        var statusCol = headers.indexOf("Status");
        if (idCol === -1 || statusCol === -1) return { success: false, error: "Column not found" };

        function colOf(name) { var i = headers.indexOf(name); return i === -1 ? -1 : i + 1; }
        var user = authCheck.email || Session.getActiveUser().getEmail();

        for (var i = 1; i < values.length; i++) {
            if (values[i][idCol] === id) {
                var rowNum = i + 1;
                sheet.getRange(rowNum, statusCol + 1).setValue(newStatus);
                if (newStatus === 'Acknowledged') {
                    var c1 = colOf('Acknowledged By'), c2 = colOf('Acknowledge Date');
                    if (c1 > 0) sheet.getRange(rowNum, c1).setValue(user);
                    if (c2 > 0) sheet.getRange(rowNum, c2).setValue(new Date());
                } else if (newStatus === 'Corrected') {
                    var c3 = colOf('Corrected By'), c4 = colOf('Corrected Date');
                    if (c3 > 0) sheet.getRange(rowNum, c3).setValue(user);
                    if (c4 > 0) sheet.getRange(rowNum, c4).setValue(new Date());
                } else if (newStatus === 'Closed') {
                    var c5 = colOf('Closed By'), c6 = colOf('Closed Date');
                    if (c5 > 0) sheet.getRange(rowNum, c5).setValue(user);
                    if (c6 > 0) sheet.getRange(rowNum, c6).setValue(new Date());
                } else if (newStatus === 'Rejected') {
                    var c7 = colOf('Rejected By'), c8 = colOf('Rejected Date'), c9 = colOf('Reject Reason');
                    if (c7 > 0) sheet.getRange(rowNum, c7).setValue(user);
                    if (c8 > 0) sheet.getRange(rowNum, c8).setValue(new Date());
                    if (c9 > 0 && rejectReason) sheet.getRange(rowNum, c9).setValue(rejectReason);
                }
                _invalidateRefSlimCache();
                return { success: true };
            }
        }
        return { success: false, error: "ID not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function deleteRefSurveyRecord(id, clientEmail) {
    try {
        // Prefer clientEmail passed from browser (Session.getActiveUser() returns empty in web app context)
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idColIdx = headers.indexOf("ID");
        if (idColIdx === -1) return { success: false, error: "ID column not found" };

        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) {
                sheet.deleteRow(i + 1);
                _invalidateRefSlimCache();
                return { success: true };
            }
        }
        return { success: false, error: "Record not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function updateRefSurveyRecord(form) {
    try {
        // Prefer clientEmail from browser — Session.getActiveUser() returns empty in web app context
        var userEmail = form.clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0].map(function(h){ return String(h).trim(); });
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[h] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == form.id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found" };

        // Ensure a column exists; create it at the end of the sheet if missing
        function ensureCol(colKey) {
            if (!colMap[colKey]) {
                headers.push(colKey);
                colMap[colKey] = headers.length;
                sheet.getRange(1, headers.length).setValue(colKey);
            }
        }
        function setVal(colKey, value) {
            if (value === undefined || value === null) return;
            ensureCol(colKey);
            sheet.getRange(rowIndex, colMap[colKey]).setValue(value);
        }

        // Basic fields
        setVal("Status",           form.status);
        setVal("Comments",         form.comments);
        setVal("Has Broken Ref",   form.hasBrokenRef);
        setVal("Broken Units",     form.brokenUnits);
        setVal("Broken Units Detail", form.brokenDetail);

        // Status-specific timestamps
        if (form.status === 'Acknowledged') {
            setVal("Acknowledged By",  userEmail);
            setVal("Acknowledge Date", new Date());
        } else if (form.status === 'Corrected') {
            setVal("Corrected By",  userEmail);
            setVal("Corrected Date", new Date());
        } else if (form.status === 'Closed') {
            setVal("Closed By",  userEmail);
            setVal("Closed Date", new Date());
        }

        // Quantity fields  {colKey: value}
        if (form.unitQty) {
            var uq = (typeof form.unitQty === 'string') ? JSON.parse(form.unitQty) : form.unitQty;
            for (var qk in uq) { setVal(qk, uq[qk]); }
        }

        // Per-unit detail fields  {"Ref Open Brand_1": value, ...}
        if (form.unitFields) {
            var uf = (typeof form.unitFields === 'string') ? JSON.parse(form.unitFields) : form.unitFields;
            for (var uk in uf) { setVal(uk, uf[uk]); }
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function updateAcSurveyRecord(form) {
    try {
        // Prefer clientEmail from browser — Session.getActiveUser() returns empty in web app context
        var adminCheck = checkSurveyAdminStatus(form.clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == form.id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found" };

        function ensureCol(name) {
            if (colMap[name]) return colMap[name];
            var lastCol = sheet.getLastColumn() + 1;
            sheet.getRange(1, lastCol).setValue(name);
            colMap[name] = lastCol;
            return lastCol;
        }

        function setVal(colName, value) {
            if (value === undefined || value === null) return;
            sheet.getRange(rowIndex, ensureCol(colName)).setValue(value);
        }

        setVal("Status",      form.status);
        setVal("Comments",    form.comments);
        setVal("Broken Units", form.brokenUnits);

        if (form.acQuantity !== undefined && form.acQuantity !== null) {
            setVal("AC Quantity", form.acQuantity);
        }

        if (form.unitFields) {
            for (var key in form.unitFields) {
                setVal(key, form.unitFields[key]);
            }
        }

        if (form.status === 'Acknowledged') {
            if (colMap["Acknowledged By"]) sheet.getRange(rowIndex, colMap["Acknowledged By"]).setValue(Session.getActiveUser().getEmail());
            if (colMap["Acknowledge Date"]) sheet.getRange(rowIndex, colMap["Acknowledge Date"]).setValue(new Date());
        } else if (form.status === 'Corrected') {
            if (colMap["Corrected By"]) sheet.getRange(rowIndex, colMap["Corrected By"]).setValue(Session.getActiveUser().getEmail());
            if (colMap["Corrected Date"]) sheet.getRange(rowIndex, colMap["Corrected Date"]).setValue(new Date());
        } else if (form.status === 'Closed') {
            if (colMap["Closed By"]) sheet.getRange(rowIndex, colMap["Closed By"]).setValue(Session.getActiveUser().getEmail());
            if (colMap["Closed Date"]) sheet.getRange(rowIndex, colMap["Closed Date"]).setValue(new Date());
        }
        _invalidateRefSlimCache();
        _invalidateAcSlimCache();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add extra photos to an existing Ref Survey record (admin only)
// files: [{ name, mimeType, data (base64) }, ...]
// unitKey: attachment key to append into, e.g. "ref_open_1"
// ─────────────────────────────────────────────────────────────────────────────
function addRefSurveyPhotos(id, unitKey, files) {
    try {
        var folderName = "Survey_Photos_Added";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }

        var newUrls = [];
        var ts = new Date().getTime();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f.data && f.name) {
                var filename = "ref_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name;
                var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found." };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };

        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };

        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 2][attachCol - 1] || "{}"); } catch(e) {}
        existing[unitKey] = (existing[unitKey] || []).concat(newUrls);

        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateRefSlimCache();
        return { success: true, newUrls: newUrls };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add extra photos to an existing Aircon Survey record (admin only)
// unitKey: attachment key to append into, e.g. "ac_inv_1"
// ─────────────────────────────────────────────────────────────────────────────
function addAcSurveyPhotos(id, unitKey, files) {
    try {
        var folderName = "Survey_Photos_Added";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }

        var newUrls = [];
        var ts = new Date().getTime();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f.data && f.name) {
                var filename = "ac_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name;
                var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found." };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };

        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };

        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 2][attachCol - 1] || "{}"); } catch(e) {}
        existing[unitKey] = (existing[unitKey] || []).concat(newUrls);

        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateAcSlimCache();
        return { success: true, newUrls: newUrls };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a single photo from an existing Ref Survey record
// unitKey: e.g. "ref_open_1", url: the thumbnail URL to remove
// ─────────────────────────────────────────────────────────────────────────────
function deleteRefSurveyPhoto(id, unitKey, url) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found." };
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });
        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };
        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };
        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 2][attachCol - 1] || "{}"); } catch(e) {}
        if (existing[unitKey]) {
            existing[unitKey] = existing[unitKey].filter(function(u) { return u !== url; });
        }
        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateRefSlimCache();
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a single photo from an existing Aircon Survey record
// unitKey: e.g. "ac_inv_1", url: the thumbnail URL to remove
// ─────────────────────────────────────────────────────────────────────────────
function deleteAcSurveyPhoto(id, unitKey, url) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        if (!sheet) return { success: false, error: "Sheet not found." };
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });
        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };
        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };
        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 2][attachCol - 1] || "{}"); } catch(e) {}
        if (existing[unitKey]) {
            existing[unitKey] = existing[unitKey].filter(function(u) { return u !== url; });
        }
        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateAcSlimCache();
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Refig + Aircon Survey Coverage Map
// Returns store list augmented with surveyStatus: 'both' | 'refig' | 'aircon' | 'none'
// ─────────────────────────────────────────────────────────────────────────────
function getRefAcMapData() {
    try {
        // 1. Load store GPS data from external DB (same source as store_map_v2)
        var extSS = SpreadsheetApp.openByUrl(
            "https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit"
        );
        var storeSheet = extSS.getSheets()[0];
        if (!storeSheet) return JSON.stringify({ error: "Store database sheet not found" });

        var storeData = storeSheet.getDataRange().getValues();
        var sHeaders = storeData[0];

        var idIdx = -1, nameIdx = -1, latIdx = -1, lngIdx = -1, provIdx = -1, buIdx = -1, buTypeIdx = -1, storeStatusIdx = -1;
        for (var k = 0; k < sHeaders.length; k++) {
            var h = String(sHeaders[k]).trim().toLowerCase();
            if (h.includes("store name(th)")) nameIdx = k;
            else if (h.includes("store name") && nameIdx === -1) nameIdx = k;
            if (h.includes("gold text") || h.includes("site id") || h.includes("store id")) idIdx = k;
            if (h === "latitude"  || h.includes("lat"))  latIdx = k;
            if (h === "longitude" || h.includes("long")) lngIdx = k;
            if (h.includes("province")) provIdx = k;
            if (h === "bu" || h === "business unit") buIdx = k;
            if (h.includes("bu type")) buTypeIdx = k;
            if (h === "status") storeStatusIdx = k;
        }

        // 1b. Build DM/CM/AM lookup from getStoreDBDataV2() — EXACT same source as Schedule
        var storeMetaMap = {};  // code → { dm, cm, am }
        try {
            var storeList = getStoreDBDataV2();
            storeList.forEach(function(s) {
                var code = (s.id || s.code || "").trim();
                if (code) storeMetaMap[code] = {
                    dm: s.dmName  || "",
                    cm: s.cmName  || "",
                    am: s.ammMtn  || ""
                };
            });
        } catch(e) {
            Logger.log("getRefAcMapData: storeMetaMap build failed: " + e);
        }

        var stores = [];

        for (var i = 1; i < storeData.length; i++) {
            var row = storeData[i];
            // Filter: only Active stores (Status = "A")
            if (storeStatusIdx > -1 && String(row[storeStatusIdx]).trim().toUpperCase() !== "A") continue;
            var lat = (latIdx > -1) ? row[latIdx] : "";
            var lng = (lngIdx > -1) ? row[lngIdx] : "";
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;

            var sid = String((idIdx > -1) ? row[idIdx] : "").trim();
            var meta = storeMetaMap[sid] || {};
            stores.push({
                id:      sid,
                name:    (nameIdx > -1)   ? String(row[nameIdx]).trim()   : "Unknown Store",
                lat:     lat,
                lng:     lng,
                province:(provIdx > -1)   ? String(row[provIdx]).trim()   : "",
                bu:      (buIdx > -1)     ? String(row[buIdx]).trim()     : "",
                buType:  (buTypeIdx > -1) ? String(row[buTypeIdx]).trim() : "",
                // DM / CM / AM from getStoreDBDataV2 — identical to Schedule
                dm:      meta.dm || "",
                cm:      meta.cm || "",
                am:      meta.am || "",
                surveyStatus: "none",
                lastRefig:  "",
                lastAircon: ""
            });
        }

        // 2. Collect branch codes from Ref_Survey_Database
        var refSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ref_Survey_Database");
        var refBranchMap = {};
        if (refSheet && refSheet.getLastRow() >= 2) {
            var refData    = refSheet.getDataRange().getValues();
            var refHeaders = refData[0];
            var rBranchCol = refHeaders.indexOf("Branch Code");
            var rTsCol     = refHeaders.indexOf("Timestamp");
            var rDMCol     = refHeaders.indexOf("DM Area");
            var rCMCol     = refHeaders.indexOf("CM Area");
            var rAMCol     = refHeaders.indexOf("AMM MTN");
            if (rBranchCol > -1) {
                for (var r = 1; r < refData.length; r++) {
                    var bc = String(refData[r][rBranchCol]).trim();
                    if (bc) refBranchMap[bc] = {
                        ts: (rTsCol > -1) ? refData[r][rTsCol] : "",
                        dm: (rDMCol > -1) ? String(refData[r][rDMCol] || "").trim() : "",
                        cm: (rCMCol > -1) ? String(refData[r][rCMCol] || "").trim() : "",
                        am: (rAMCol > -1) ? String(refData[r][rAMCol] || "").trim() : ""
                    };
                }
            }
        }

        // 3. Collect branch codes from Aircon_Survey_Database
        var acSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Aircon_Survey_Database");
        var acBranchMap = {};
        if (acSheet && acSheet.getLastRow() >= 2) {
            var acData    = acSheet.getDataRange().getValues();
            var acHeaders = acData[0];
            var aBranchCol = acHeaders.indexOf("Branch Code");
            var aTsCol     = acHeaders.indexOf("Timestamp");
            var aDMCol     = acHeaders.indexOf("DM Area");
            var aCMCol     = acHeaders.indexOf("CM Area");
            var aAMCol     = acHeaders.indexOf("AMM MTN");
            if (aBranchCol > -1) {
                for (var a = 1; a < acData.length; a++) {
                    var abc = String(acData[a][aBranchCol]).trim();
                    if (abc) acBranchMap[abc] = {
                        ts: (aTsCol > -1) ? acData[a][aTsCol] : "",
                        dm: (aDMCol > -1) ? String(acData[a][aDMCol] || "").trim() : "",
                        cm: (aCMCol > -1) ? String(acData[a][aCMCol] || "").trim() : "",
                        am: (aAMCol > -1) ? String(acData[a][aAMCol] || "").trim() : ""
                    };
                }
            }
        }

        // 4. Merge survey status onto each store
        var tz = Session.getScriptTimeZone();
        stores.forEach(function(s) {
            var hasRef  = !!refBranchMap[s.id];
            var hasAc   = !!acBranchMap[s.id];
            var refInfo = refBranchMap[s.id] || {};
            var acInfo  = acBranchMap[s.id]  || {};

            if (hasRef && hasAc)  s.surveyStatus = "both";
            else if (hasRef)      s.surveyStatus = "refig";
            else if (hasAc)       s.surveyStatus = "aircon";
            else                  s.surveyStatus = "none";

            // DM/CM/AM already set from storeMetaMap (Store DB) — no override needed

            if (hasRef && refInfo.ts instanceof Date)
                s.lastRefig  = Utilities.formatDate(refInfo.ts, tz, "dd/MM/yyyy");
            if (hasAc  && acInfo.ts  instanceof Date)
                s.lastAircon = Utilities.formatDate(acInfo.ts,  tz, "dd/MM/yyyy");
        });

        return JSON.stringify({ stores: stores });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ─── Combined Aircon + Ref Cumulative Daily Trend ────────────────────────────

function getCombinedSurveyMonthlyTrend() {
    try {
        // ── 10-minute script cache ────────────────────────────────────────────
        var _sc = CacheService.getScriptCache();
        var _cached = _sc.get('COMBINED_TREND_V1');
        if (_cached) return JSON.parse(_cached);
        // ─────────────────────────────────────────────────────────────────────

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheetDefs = [
            { name: 'Aircon_Survey_Database', key: 'aircon' },
            { name: 'Ref_Survey_Database',    key: 'ref'    }
        ];

        var dayData = {};  // "YYYY-MM-DD" -> { aircon: 0, ref: 0 }
        var minTs = Infinity, maxTs = -Infinity;

        sheetDefs.forEach(function(def) {
            var sheet = ss.getSheetByName(def.name);
            if (!sheet || sheet.getLastRow() < 2) return;

            // Read only row 1 first to find the column positions we need.
            var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            var tsIdx = -1, statusIdx = -1;
            for (var h = 0; h < headerRow.length; h++) {
                var hdr = String(headerRow[h]).toLowerCase().trim();
                if (hdr === 'timestamp') tsIdx = h;
                if (hdr === 'status')    statusIdx = h;
            }
            if (tsIdx < 0) return;

            // Only read up to the furthest needed column.
            var maxNeeded = Math.max(tsIdx, statusIdx) + 1;
            var nRows = sheet.getLastRow() - 1;
            var data = sheet.getRange(2, 1, nRows, maxNeeded).getValues();
            var headers = headerRow; // kept for reference

            for (var i = 0; i < data.length; i++) {
                var row    = data[i];
                var tsRaw  = row[tsIdx];
                var status = statusIdx >= 0 && statusIdx < row.length ? String(row[statusIdx] || '').trim() : '';
                if (status === 'Draft') continue;

                var dt = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                if (isNaN(dt.getTime())) continue;

                var ms = dt.getTime();
                if (ms < minTs) minTs = ms;
                if (ms > maxTs) maxTs = ms;

                var dayKey = dt.getFullYear() + '-' +
                             String(dt.getMonth() + 1).padStart(2, '0') + '-' +
                             String(dt.getDate()).padStart(2, '0');
                if (!dayData[dayKey]) dayData[dayKey] = { aircon: 0, ref: 0 };
                dayData[dayKey][def.key]++;
            }
        });

        if (minTs === Infinity) return { success: true, labels: [], aircon: [], ref: [] };

        // Fill every calendar day from first to last submission
        var labels = [], fullDates = [], airconCum = [], refCum = [], airconDaily = [], refDaily = [];
        var cumAircon = 0, cumRef = 0;
        var cur = new Date(minTs);
        cur.setHours(0, 0, 0, 0);
        var end = new Date(maxTs);
        end.setHours(0, 0, 0, 0);

        while (cur <= end) {
            var key = cur.getFullYear() + '-' +
                      String(cur.getMonth() + 1).padStart(2, '0') + '-' +
                      String(cur.getDate()).padStart(2, '0');
            var dayLabel = String(cur.getDate()).padStart(2, '0') + '/' +
                           String(cur.getMonth() + 1).padStart(2, '0');
            var d = dayData[key] || { aircon: 0, ref: 0 };
            cumAircon += d.aircon;
            cumRef    += d.ref;
            labels.push(dayLabel);
            fullDates.push(key);
            airconCum.push(cumAircon);
            refCum.push(cumRef);
            airconDaily.push(d.aircon);
            refDaily.push(d.ref);
            cur.setDate(cur.getDate() + 1);
        }

        var result = { success: true, labels: labels, fullDates: fullDates,
                 aircon: airconCum, ref: refCum,
                 airconDaily: airconDaily, refDaily: refDaily };
        // Write to cache (10 min)
        try { _sc.put('COMBINED_TREND_V1', JSON.stringify(result), 600); } catch(_ce) {}
        return result;

    } catch (e) {
        Logger.log('getCombinedSurveyMonthlyTrend Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}
