// --- Work Order Report Features ---

function getPendingWorkOrders(clientEmail) {
    try {
        // Use provided clientEmail (from custom login) or fallback to script user
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { orders: [], isAdmin: isAdmin, user: userEmail };
        
        var data = sheet.getDataRange().getValues();
        var pending = [];
        
        // Skip header
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var status = row[7];
            
            // Return both "Pending" and "Waiting Approval"
            if (status === "Pending" || status === "Waiting Approval") {
                var assigneeId = row[2];
                var assigneeEmail = getEmployeeEmail(assigneeId);
                
                // Get n+1 and n+2
                var managerEmail = getManagerEmailForEmployee(assigneeId); // n+1
                var managersManagerEmail = getManagersManagerEmail(assigneeId); // n+2
                
                // Check if user is the requester (prevent self-approval)
                var isRequester = (assigneeEmail && userEmail && assigneeEmail.toLowerCase() === userEmail.toLowerCase());
                
                // Check if user is n+1 or n+2
                var isDirectManager = (managerEmail && userEmail && managerEmail.toLowerCase() === userEmail.toLowerCase());
                var isManagersManager = (managersManagerEmail && userEmail && managersManagerEmail.toLowerCase() === userEmail.toLowerCase());
                
                // Permission: Admin OR (n+1 OR n+2) AND NOT requester
                var canApprove = isAdmin || ((isDirectManager || isManagersManager) && !isRequester);
                
                pending.push({
                    id: row[1],
                    timestamp: row[0],
                    empId: row[2],
                    project: row[3],
                    details: row[4],
                    priority: row[5],
                    deadline: row[6] ? Utilities.formatDate(new Date(row[6]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                    status: status,
                    evidence: row[10] || "",
                    attachment: row[12] || "",
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

        // Return most recent first
        return { 
            orders: pending.reverse(),
            isAdmin: isAdmin,
            user: userEmail
        };

    } catch (e) {
        return { orders: [], isAdmin: false, error: e.toString() };
    }
}

function uploadWorkOrderEvidence(id, fileData) {
    try {
        // 1. Upload File
        var folderName = "Work_Orders_Evidence";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }
        
        var filename = id + "_" + fileData.name;
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
        
        // 2. Update Sheet
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == id) {
                rowIndex = i + 1;
                break;
            }
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, 11).setValue(fileUrl); // Evidence Col
            sheet.getRange(rowIndex, 8).setValue("Waiting Approval"); // Status
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
         return { success: false, error: e.toString() };
    }
}

function approveWorkOrder(workOrderId, approverName, rating) {
    try {
        var userEmail = Session.getActiveUser().getEmail();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;
        var empId = null;
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == workOrderId) {
                rowIndex = i + 1;
                empId = data[i][2];
                break;
            }
        }
        
        // Get requester's email to prevent self-approval
        var requesterEmail = getEmployeeEmail(empId);
        
        // Check if user is trying to approve their own request
        if (requesterEmail && userEmail && requesterEmail.toLowerCase() === userEmail.toLowerCase()) {
            return { success: false, error: "Access Denied: You cannot approve your own work order." };
        }
        
        // Get n+1 (direct manager) and n+2 (manager's manager)
        var managerEmail = getManagerEmailForEmployee(empId); // n+1
        var managersManagerEmail = getManagersManagerEmail(empId); // n+2
        
        var isDirectManager = (userEmail && managerEmail && userEmail.toLowerCase() === managerEmail.toLowerCase());
        var isManagersManager = (userEmail && managersManagerEmail && userEmail.toLowerCase() === managersManagerEmail.toLowerCase());
        
        if (userEmail !== ADMIN_EMAIL && !isDirectManager && !isManagersManager) {
             return { success: false, error: "Access Denied: Only the direct manager (n+1), their manager (n+2), or Admin can approve." };
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, 8).setValue("Closed"); // Status Changed to Closed
            sheet.getRange(rowIndex, 9).setValue(approverName); // Approved By
            sheet.getRange(rowIndex, 10).setValue(new Date()); // Date
            sheet.getRange(rowIndex, 12).setValue(rating); // Rating
            
            // --- Send Approval Email ---
            var emailSent = false;
            try {
                var toEmail = requesterEmail;
                var ccEmails = [];
                
                // CC Manager and Manager's Manager
                if (managerEmail) ccEmails.push(managerEmail);
                
                var managersManagerEmail = getManagersManagerEmail(empId);
                if (managersManagerEmail) ccEmails.push(managersManagerEmail);
                
                var uniqueCC = [...new Set(ccEmails)];
                
                if (toEmail) {
                   var subject = "Work Order Approved/Closed: " + workOrderId;
                   var htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #15803d;">Work Order Closed</h2>
                        <p>The work order <strong>${workOrderId}</strong> has been approved and closed.</p>
                        <p><strong>Approver:</strong> ${approverName}</p>
                        <p><strong>Rating:</strong> ${rating}/5</p>
                        <hr>
                        <a href="${ScriptApp.getService().getUrl()}?page=work-order-report">View Dashboard</a>
                    </div>
                   `;
                   
                   var emailOptions = {
                        to: toEmail,
                        subject: subject,
                        htmlBody: htmlBody
                   };
                   
                   if (uniqueCC.length > 0) {
                       emailOptions.cc = uniqueCC.join(",");
                   }
                   
                   MailApp.sendEmail(emailOptions);
                   console.log("Approval Email sent to: " + toEmail + (uniqueCC.length > 0 ? ", CC: " + uniqueCC.join(", ") : ""));
                   emailSent = true;
                }
            } catch (e) {
                console.warn("Approval Email Failed: " + e.toString());
            }

            return { success: true, emailSent: emailSent };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getAllWorkOrdersReport(email) {
    try {
        // Use provided email or fallback to Session user
        var userEmail = email || Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        // --- Find Current User's Employee ID ---
        var currentUserEmpId = null;
        if (userEmail) {
             // 1. Check Admin Status via Central Function
             var adminStatus = checkAdminStatus(userEmail);
             if (adminStatus.isAdmin) {
                 isAdmin = true;
             }
             
             // 2. Resolve Employee ID for Assignee Matching
             try {
                var empSheet = findEmployeeSheet();
                var empData = empSheet.getDataRange().getValues();
                
                // We still need to find ID to match assignees
                // Use dynamic header logic similar to checkAdminStatus if possible, 
                // but for now standard email column (Index 6) is the convention unless checkAdminStatus returns ID.
                // checkAdminStatus doesn't return ID, so we loop.
                for (var j = 1; j < empData.length; j++) {
                    var rowEmail = empData[j][6]; 
                    if (rowEmail && rowEmail.toString().trim().toLowerCase() === userEmail.toString().trim().toLowerCase()) {
                        currentUserEmpId = String(empData[j][1]); // Found ID
                        break;
                    }
                }
            } catch (err) {
                console.warn("Error resolving user ID: " + err);
            }
        }

        // ---------------------------------------

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { orders: [], isAdmin: isAdmin };
        
        var data = sheet.getDataRange().getValues();
        var orders = [];
        
        // Skip header
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            
            // --- Confidence Logic ---
            var isConfidential = (row[16] === true || row[16] === "TRUE" || row[16] === "true");
            var assigneeId = String(row[2]);
            
            // If Confidential: Only Admin OR Assignee can see
            if (isConfidential && !isAdmin && assigneeId !== currentUserEmpId) {
                continue; // Skip this row
            }
            // ------------------------

            orders.push({
                timestamp: row[0] ? Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : "",
                id: row[1],
                empId: row[2],
                project: row[3],
                details: row[4],
                priority: row[5],
                deadline: row[6] ? Utilities.formatDate(new Date(row[6]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                status: row[7],
                approvedBy: row[8],
                approvalDate: row[9] ? Utilities.formatDate(new Date(row[9]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                evidence: row[10],
                rating: row[11],
                creationAttachment: row[12],
                startDate: row[13] ? Utilities.formatDate(new Date(row[13]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                station: row[14] || "", // Col 15 (Index 14)
                classification: row[15] || "", // Col 16 (Index 15)
                confidential: isConfidential // Col 17
            });
        }
        
        // Resolve Names & Managers
        var empSheet = findEmployeeSheet();
        var empData = empSheet.getDataRange().getValues();
        var empMap = {};      // ID -> Name
        var managerMap = {};  // ID -> ManagerName
        
        // Skip header
        for(var j=1; j<empData.length; j++) {
            var eid = String(empData[j][1]); // Col 1: ID
            var ename = empData[j][2];       // Col 2: Name
            var mname = empData[j][4];       // Col 4: Manager Name
            
            if(eid) {
                empMap[eid] = ename;
                managerMap[eid] = mname;
            }
        }
        
        // Re-loop to fill maps correctly (cleaner way)
        var deptMap = {};
        var zoneMap = {};
        for(var j=1; j<empData.length; j++) {
             var eid = String(empData[j][1]);
             if(eid) {
                 deptMap[eid] = empData[j][13];
                 zoneMap[eid] = empData[j][8]; // Col 9: Zone
             }
        }

        orders.forEach(function(p) {
            p.empName = empMap[p.empId] || p.empId;
            p.managerName = managerMap[p.empId] || "-";
            p.department = deptMap[p.empId] || "-";
            p.zone = zoneMap[p.empId] || "-";
        });

        // Prepare employee list for frontend dropdown
        var employeeList = [];
        for(var j=1; j<empData.length; j++) {
            var eid = String(empData[j][1]); // Employee ID
            var ename = empData[j][2];       // Name
            if(eid && ename) {
                employeeList.push({
                    id: eid,
                    name: ename
                });
            }
        }

        // Sort by newest
        return { 
            orders: orders.reverse(), 
            isAdmin: isAdmin,
            employeeList: employeeList
        };

    } catch (e) {
        return { orders: [], error: e.toString() };
    }
}

function updateWorkOrder(form) {
    try {
        // --- Admin Check ---
        var userEmail = Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        if (!isAdmin) {
             var status = checkAdminStatus(userEmail);
             if (status.isAdmin) isAdmin = true;
        }
        
        if (!isAdmin) {
            return { success: false, error: "Access Denied: Only Admins can edit work orders." };
        }
        // -------------------

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        ensureWorkOrderHeaders(sheet);

        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;

        // Find row by ID (Col 1)
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == form.id) {
                rowIndex = i + 1;
                break;
            }
        }

        if (rowIndex > 0) {
            // Update Allowed Fields
            Logger.log("Update Request for ID: " + form.id);
            Logger.log("New Emp ID: " + form.empId);

            if (form.empId) {
                 sheet.getRange(rowIndex, 3).setValue(form.empId); 
            } else {
                 Logger.log("Warning: No empId provided in update form.");
            }

            if (form.project) sheet.getRange(rowIndex, 4).setValue(form.project);
            if (form.details) sheet.getRange(rowIndex, 5).setValue(form.details);
            if (form.priority) sheet.getRange(rowIndex, 6).setValue(form.priority);
            if (form.deadline) sheet.getRange(rowIndex, 7).setValue(form.deadline);
            if (form.evidence) sheet.getRange(rowIndex, 11).setValue(form.evidence);
            if (form.rating) sheet.getRange(rowIndex, 12).setValue(form.rating);
            if (form.startDate) sheet.getRange(rowIndex, 14).setValue(new Date(form.startDate));
            if (form.station) sheet.getRange(rowIndex, 15).setValue(form.station);
            if (form.classification) sheet.getRange(rowIndex, 16).setValue(form.classification);
            
            // Handle Confidential (Col 17)
            if (form.hasOwnProperty('confidential')) {
                Logger.log('Updating confidential field to: ' + form.confidential + ' for row: ' + rowIndex);
                sheet.getRange(rowIndex, 17).setValue(form.confidential);
            } else {
                Logger.log('Confidential property not found in form object');
            }
            
            // Handle Status Change
            if (form.status) {
                sheet.getRange(rowIndex, 8).setValue(form.status);
                
                // If approving/closing, Set Approver info
                if (form.status === 'Approved' || form.status === 'Closed') {
                    // Use provided email (from custom auth) or fallback to Session
                    var currentUserEmail = form.approverEmail || Session.getActiveUser().getEmail();
                    var approverName = currentUserEmail; // Default to email
                    
                    // Try to find Name from Employee DB
                    var empSheet = findEmployeeSheet();
                    var empData = empSheet.getDataRange().getValues();
                    for(var k=1; k<empData.length; k++) {
                        if(String(empData[k][6]).trim().toLowerCase() === String(currentUserEmail).trim().toLowerCase()) {
                            approverName = empData[k][2]; // Name
                            break;
                        }
                    }
                    
                    sheet.getRange(rowIndex, 9).setValue(approverName);
                    sheet.getRange(rowIndex, 10).setValue(new Date());
                }
            }
            
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function deleteWorkOrder(id) {
    try {
        // --- Admin Check ---
        var userEmail = Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        if (!isAdmin) {
             var status = checkAdminStatus(userEmail);
             if (status.isAdmin) isAdmin = true;
        }
        
        if (!isAdmin) {
            return { success: false, error: "Access Denied: Only Admins can delete work orders." };
        }
        // -------------------

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;

        // Find row by ID (Col 1)
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == id) {
                rowIndex = i + 1;
                break;
            }
        }

        if (rowIndex > 0) {
            sheet.deleteRow(rowIndex);
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function batchUpdateWorkOrders(updates) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var idMap = {}; // Map ID -> Row Index (0-based compatible with data array)
        
        // Create ID Map
        for (var i = 1; i < data.length; i++) {
            idMap[data[i][1]] = i + 1; // Store 1-based Row Index
        }

        updates.forEach(function(update) {
            var rowIndex = idMap[update.id];
            if (rowIndex) {
                // Determine Column based on field
                // Col 4: Project, Col 6: Priority, Col 7: Deadline, Col 8: Status
                var colIndex = -1;
                var value = update.value;

                if (update.field === 'project') colIndex = 4;
                else if (update.field === 'priority') colIndex = 6;
                else if (update.field === 'deadline') { 
                    colIndex = 7;
                    value = new Date(value);
                }
                else if (update.field === 'status') {
                    colIndex = 8;
                    // Handle Status Side Effects (if closed/approved)
                     if (value === 'Approved' || value === 'Closed') {
                        // For bulk updates, we might default to current user
                        var userEmail = Session.getActiveUser().getEmail();
                        sheet.getRange(rowIndex, 9).setValue(userEmail); // Approved By
                        sheet.getRange(rowIndex, 10).setValue(new Date()); // Date
                    }
                }

                if (colIndex > 0) {
                    sheet.getRange(rowIndex, colIndex).setValue(value);
                }
            }
        });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Upload Work Order Attachment to Google Drive
function uploadWorkOrderAttachment(fileData) {
    try {
        var folderName = "Work_Order_Attachments";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        
        if (folders.hasNext()) {
            folder = folders.next();
        } else {
            folder = DriveApp.createFolder(folderName);
        }
        
        // Decode base64 and create file
        var blob = Utilities.newBlob(
            Utilities.base64Decode(fileData.data), 
            fileData.mimeType, 
            fileData.fileName
        );
        
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        // Return direct link for documents, thumbnail for images
        var fileId = file.getId();
        var fileUrl;
        
        if (fileData.mimeType.startsWith('image/')) {
            fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + fileId;
        } else {
            fileUrl = "https://drive.google.com/file/d/" + fileId + "/view";
        }
        
        return { success: true, url: fileUrl };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function ensureWorkOrderHeaders(sheet) {
    if (!sheet) return;

    // Check/Add specific headers by index (1-based). Row 1 is headers.
    // Read the whole header row once instead of 7 separate getValue() round-trips.
    var lastCol = sheet.getLastColumn();
    var maxCol  = sheet.getMaxColumns();
    var hdr     = sheet.getRange(1, 1, 1, maxCol).getValues()[0];
    var get     = function(c) { return c <= maxCol ? hdr[c - 1] : undefined; };

    // Col 11-13: only label if the column already exists but is blank
    if (lastCol >= 11 && get(11) === "") sheet.getRange(1, 11).setValue("Evidence URL");
    if (lastCol >= 12 && get(12) === "") sheet.getRange(1, 12).setValue("Rating");
    if (lastCol >= 13 && get(13) === "") sheet.getRange(1, 13).setValue("Creation Attachment");

    // Col 14-17: ensure exact header text (bold)
    if (get(14) !== "Start Date")     sheet.getRange(1, 14).setValue("Start Date").setFontWeight("bold");
    if (get(15) !== "Store")          sheet.getRange(1, 15).setValue("Store").setFontWeight("bold");
    if (get(16) !== "Classification") sheet.getRange(1, 16).setValue("Classification").setFontWeight("bold");
    if (get(17) !== "Confidential")   sheet.getRange(1, 17).setValue("Confidential").setFontWeight("bold");
}
