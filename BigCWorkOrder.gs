// --- Big C Work Order Feature ---

function processBigCWorkOrderForm(form) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        var headers = ["Timestamp", "ID", "Employee ID", "Project/Task", "Details", "Priority", "Deadline", "Status", "Approved By", "Approval Date", "Evidence URL", "Rating", "Creation Attachment", "Start Date", "Work Doc Number", "Estimated Budget", "Budget Type", "Contract", "Vendor", "Station", "PR Number", "PO Number", "Objective", "BU"];
        
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("BigC_Work_Orders");
            sheet.appendRow(headers);
        } else if (sheet.getLastRow() === 0) {
             sheet.appendRow(headers);
        }

        var id = "WO-BC-" + new Date().getTime(); 
        var attachmentUrls = [];
        var emailAttachments = []; // Store blobs for email

        // Handle Creation Attachments (Multiple)
        if (form.attachmentList && form.attachmentList.length > 0) {
            var folderName = "BigC_Work_Orders_Attachments";
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
                    emailAttachments.push(blob); // Add blob to email list
                }
            });
        }
        else if (form.attachmentData && form.attachmentName) {
             var folderName = "BigC_Work_Orders_Attachments";
             var folder;
             var folders = DriveApp.getFoldersByName(folderName);
             if (folders.hasNext()) { folder = folders.next(); }
             else { folder = DriveApp.createFolder(folderName); }
             
             var filename = id + "_" + form.attachmentName;
             var blob = Utilities.newBlob(Utilities.base64Decode(form.attachmentData), form.attachmentMimeType, filename);
             var file = folder.createFile(blob);
             file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
             attachmentUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
             emailAttachments.push(blob); // Add blob to email list
        }

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
            attachmentUrls.join("\n"), 
            form.startDate ? Utilities.formatDate(new Date(form.startDate), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
            form.workDocNumber,
            form.estimatedBudget,
            form.budgetType,
            form.contract,
            form.vendor,
            form.station,
            form.prNumber || "",
            form.poNumber || "",
            form.objective || "",
            form.bu || ""
        ]);

        // --- Email Notification Logic ---
        var emailSent = false;
        var emailLog = "";
        try {
            var toEmail = "";
            var ccEmails = [];
            
            // 1. Assignee Email (N) - TO recipient
            var assigneeEmail = getEmployeeEmail(form.empId);
            toEmail = assigneeEmail;
            
            // 2. Manager Emails (N+1, N+2) - CC
            var managerEmail = getManagerEmailForEmployee(form.empId);
            if (managerEmail) ccEmails.push(managerEmail);
            
            var managersManagerEmail = getManagersManagerEmail(form.empId);
            if (managersManagerEmail) ccEmails.push(managersManagerEmail);
            
            // 3. Additional Email - CC
            if (form.additionalEmail && form.additionalEmail.trim() !== "") {
                ccEmails.push(form.additionalEmail.trim());
            }

            // 4. Vendor Email - CC
            if (form.vendor) {
                 var vendors = getVendorList(); 
                 var matchedVendor = vendors.find(function(v) { return v.name === form.vendor; });
                 if (matchedVendor && matchedVendor.email) {
                     ccEmails.push(matchedVendor.email);
                 }
            }
            
            // 5. Add CMS_REP1 and M_CMS_REP1 from Employee Database (Note Column) - CC
            try {
                var empSheet = findEmployeeSheet();
                if (empSheet) {
                    var empData = empSheet.getDataRange().getValues();
                    var headers = empData[0];
                    var noteColIndex = -1;
                    
                    // Find Note column
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
                                // Check for CMS_REP1 or M_CMS_REP1
                                if (noteValueLower === "cms_rep1" || noteValueLower === "m_cms_rep1") {
                                    // Get email from column 7 (index 6)
                                    var repEmail = empData[r][6];
                                    if (repEmail && String(repEmail).indexOf("@") > -1) {
                                        ccEmails.push(String(repEmail).trim());
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (repErr) {
                Logger.log("Error fetching CMS_REP1 emails: " + repErr.toString());
            }

            // --- Lookup Employee Name & Dept for Report ---
            var empName = form.empId;
            var empDept = "";
            try {
                var empSheet = findEmployeeSheet();
                if (empSheet) {
                    var empData = empSheet.getDataRange().getValues();
                    // Assuming Col 1 = ID, Col 2 = Name, Col 13 = Dept
                    for(var j=1; j<empData.length; j++) {
                         // Robust ID match
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

            if (toEmail) {
                var subject = "Big C Work Order Review: " + form.project + " (Pending)";
                
                // --- HTML Email Body ---
                var htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                    <h2 style="color: #1a73e8; margin-top: 0; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Big C Work Order Request</h2>
                    
                    <p style="color: #555;">A new Big C Work Order has been submitted and is pending review.</p>

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
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Requestor</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <strong>${empName}</strong><br>
                                <span style="font-size: 12px; color: #777;">ID: ${form.empId} | Dept: ${empDept || '-'}</span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Work Doc Number</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${form.workDocNumber || '-'}</td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">PR Number</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${form.prNumber || '-'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">PO Number</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${form.poNumber || '-'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Station</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${form.station || '-'}</td>
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
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Budget</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <div>${form.estimatedBudget || '0'} THB</div>
                                <div style="font-size: 12px; color: #555;">Type: ${form.budgetType || '-'}</div>
                            </td>
                        </tr>
                        <tr style="background-color: #f8f9fa;">
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Contract & Vendor</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                <div>Contract: ${form.contract || '-'}</div>
                                <div>Vendor: ${form.vendor || '-'}</div>
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
                            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; vertical-align: top;">Attachments</td>
                            <td style="padding: 10px; border: 1px solid #e0e0e0;">
                                ${attachmentUrls.map(function(url) { return '<a href="' + url + '" target="_blank" style="color: #1a73e8; text-decoration: none;">📎 View Attachment</a>'; }).join('<br>')}
                            </td>
                        </tr>
                        ` : ''}
                    </table>

                    <div style="margin-top: 25px; text-align: center;">
                        <a href="${ScriptApp.getService().getUrl()}?page=bigc-work-order-report" 
                           style="background-color: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           Open Dashboard to Review
                        </a>
                    </div>
                    
                    <div style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
                        This is an automated message from the Big C Work Order System.
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

                if (emailAttachments.length > 0) {
                    emailOptions.attachments = emailAttachments;
                }

                MailApp.sendEmail(emailOptions);
                console.log("BigC Email sent to: " + toEmail + (uniqueCC.length > 0 ? ", CC: " + uniqueCC.join(", ") : ""));
                emailSent = true;
                emailLog = "Sent to assignee" + (uniqueCC.length > 0 ? " + " + uniqueCC.length + " CC" : "");
            } else {
                console.warn("WARNING: No assignee email found for BigC Work Order " + id + ". Check Employee DB for ID: " + form.empId);
                emailLog = "No assignee email found";
            }
        } catch (mailErr) {
            console.error("Email Error: " + mailErr.toString());
            emailLog = "Error: " + mailErr.toString();
        }

        return { success: true, emailSent: emailSent, emailLog: emailLog };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getPendingBigCWorkOrders(clientEmail) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        if (!sheet) return { orders: [], isAdmin: isAdmin, user: userEmail };
        
        var data = sheet.getDataRange().getValues();
        var pending = [];
        
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var status = row[7];
            
            if (status === "Pending" || status === "Waiting Approval") {
                var assigneeId = row[2];
                var managerEmail = getManagerEmailForEmployee(assigneeId);
                
                var mnEmailSafe = managerEmail ? managerEmail.toLowerCase() : "";
                var usEmailSafe = userEmail ? userEmail.toLowerCase() : "";
                
                var canApprove = isAdmin || (mnEmailSafe && usEmailSafe && usEmailSafe === mnEmailSafe);
                
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

        return { 
            orders: pending.reverse(),
            isAdmin: isAdmin,
            user: userEmail
        };

    } catch (e) {
        return { orders: [], isAdmin: false, error: e.toString() };
    }
}

function uploadBigCWorkOrderEvidence(id, fileData) {
    try {
        var folderName = "BigC_Work_Orders_Evidence";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }
        
        var filename = id + "_" + fileData.name;
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;
        
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == id) {
                rowIndex = i + 1;
                break;
            }
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, 11).setValue(fileUrl); 
            sheet.getRange(rowIndex, 8).setValue("Waiting Approval"); 
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
         return { success: false, error: e.toString() };
    }
}

function approveBigCWorkOrder(workOrderId, approverName, rating) {
    try {
        var userEmail = Session.getActiveUser().getEmail();
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
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
        
        var managerEmail = getManagerEmailForEmployee(empId);
        var isManager = (userEmail && managerEmail && userEmail.toLowerCase() === managerEmail.toLowerCase());
        
        if (userEmail !== ADMIN_EMAIL && !isManager) {
             return { success: false, error: "Access Denied: Only Manager or Admin can approve." };
        }
        
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, 8).setValue("Closed"); 
            sheet.getRange(rowIndex, 9).setValue(approverName); 
            sheet.getRange(rowIndex, 10).setValue(new Date()); 
            sheet.getRange(rowIndex, 12).setValue(rating); 
            
            // --- Send Email ---
            var emailSent = false;
            try {
                 // Get Requester Email
                 var requesterEmail = getEmployeeEmail(empId);
                 var toEmail = requesterEmail;
                 var ccEmails = [];
                 
                 // CC managers
                 var managerEmail = getManagerEmailForEmployee(empId);
                 if (managerEmail) ccEmails.push(managerEmail);
                 
                 var managersManagerEmail = getManagersManagerEmail(empId);
                 if (managersManagerEmail) ccEmails.push(managersManagerEmail);
                 
                 var uniqueCC = [...new Set(ccEmails)];
                 
                 if (toEmail) {
                     var subject = "Big C Work Order Closed: " + workOrderId;
                     var htmlBody = `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2 style="color: #15803d;">Work Order Closed</h2>
                            <p>Big C Work Order <strong>${workOrderId}</strong> has been approved and closed.</p>
                            <p><strong>Approver:</strong> ${approverName}</p>
                            <p><strong>Rating:</strong> ${rating}/5</p>
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
                     console.log("BigC Approval Email sent to: " + toEmail + (uniqueCC.length > 0 ? ", CC: " + uniqueCC.join(", ") : ""));
                     emailSent = true;
                 }
            } catch(e) {
                console.warn("BigC Email Fail: " + e.toString());
            }
            
            return { success: true, emailSent: emailSent };
        } else {
            return { success: false, error: "Order not found" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
function getAllBigCWorkOrdersReport(userEmail) {
    try {
        // Use passed email from frontend auth, fallback to session email
        if (!userEmail) {
            userEmail = Session.getActiveUser().getEmail();
        }
        var isAdmin = (userEmail === ADMIN_EMAIL);
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        if (!sheet) return { orders: [], isAdmin: isAdmin };
        
        var data = sheet.getDataRange().getValues();
        var orders = [];
        
        // Skip header
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
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
                // New Fields
                workDocNumber: row[14],
                estimatedBudget: row[15],
                budgetType: row[16],
                contract: row[17],
                vendor: row[18],
                station: row[19],
                prNumber: row[20],
                poNumber: row[21],
                objective: row[22],
                bu: row[23]
            });
        }
        
        // Resolve Names & Managers (Reusing logic structure from Code.gs)
        var empSheet = findEmployeeSheet();
        var empData = empSheet.getDataRange().getValues();
        var empMap = {};      // ID -> Name
        var managerMap = {};  // ID -> ManagerName
        var deptMap = {};     // ID -> Department
        var zoneMap = {};     // ID -> Zone
        
        // Check admin status by Usetype column (Col 15, Index 14)
        if (!isAdmin) {
            for (var j = 1; j < empData.length; j++) {
                var rowEmail = empData[j][6]; // Col 7: Email
                if (rowEmail && userEmail && rowEmail.toString().trim().toLowerCase() === userEmail.toString().trim().toLowerCase()) {
                    var userType = empData[j][14]; // Col 15: Usetype
                    if (userType && userType.toString().trim().toLowerCase() === 'admin') {
                        isAdmin = true;
                    }
                    break;
                }
            }
        }
        
        // Skip header
        for(var j=1; j<empData.length; j++) {
            var eid = String(empData[j][1]); // Col 1: ID
            if(eid) {
                empMap[eid] = empData[j][2];       // Col 2: Name
                managerMap[eid] = empData[j][4];   // Col 4: Manager Name
                deptMap[eid] = empData[j][13];     // Col 14: Department
                zoneMap[eid] = empData[j][8];      // Col 9: Zone
            }
        }

        orders.forEach(function(p) {
            p.empName = empMap[p.empId] || p.empId;
            p.managerName = managerMap[p.empId] || "-";
            p.department = deptMap[p.empId] || "-";
            p.zone = zoneMap[p.empId] || "-";
        });

        // Sort by newest
        return { orders: orders.reverse(), isAdmin: isAdmin, user: userEmail };

    } catch (e) {
        return { orders: [], isAdmin: false, error: e.toString() };
    }
}

function updateBigCWorkOrder(form) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };

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
            // Col 4: Project, Col 5: Details, Col 6: Priority, Col 7: Deadline
            sheet.getRange(rowIndex, 4).setValue(form.project);
            sheet.getRange(rowIndex, 5).setValue(form.details);
            sheet.getRange(rowIndex, 6).setValue(form.priority);
            if (form.deadline) sheet.getRange(rowIndex, 7).setValue(new Date(form.deadline));
            
            // Handle Status Update
            var currentStatus = sheet.getRange(rowIndex, 8).getValue();
            if (form.status && form.status !== currentStatus) {
                sheet.getRange(rowIndex, 8).setValue(form.status);
                
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
                     sheet.getRange(rowIndex, 9).setValue(approver);
                     sheet.getRange(rowIndex, 10).setValue(new Date());
                }
            }

            // Handle Rating
            if (form.rating) {
                sheet.getRange(rowIndex, 12).setValue(form.rating);
            }

            // Handle All Other Fields
            // Start Date (14), Work Doc (15), Est Budget (16), Budget Type (17), Contract (18), Vendor (19), Station (20)
            if(form.startDate !== undefined) sheet.getRange(rowIndex, 14).setValue(form.startDate);
            if(form.workDocNumber !== undefined) sheet.getRange(rowIndex, 15).setValue(form.workDocNumber);
            if(form.estimatedBudget !== undefined) sheet.getRange(rowIndex, 16).setValue(form.estimatedBudget);
            if(form.budgetType !== undefined) sheet.getRange(rowIndex, 17).setValue(form.budgetType);
            if(form.contract !== undefined) sheet.getRange(rowIndex, 18).setValue(form.contract);
            if(form.vendor !== undefined) sheet.getRange(rowIndex, 19).setValue(form.vendor);
            if(form.station !== undefined) sheet.getRange(rowIndex, 20).setValue(form.station);

            // Handle PR Number
            // Column 21
            if (form.prNumber !== undefined) {
                 sheet.getRange(rowIndex, 21).setValue(form.prNumber);
            }
            // PO Number - Column 22
            if (form.poNumber !== undefined) {
                 sheet.getRange(rowIndex, 22).setValue(form.poNumber);
            }
            
            // Handle Objective & BU
            if (form.objective !== undefined) sheet.getRange(rowIndex, 23).setValue(form.objective);
            if (form.bu !== undefined) sheet.getRange(rowIndex, 24).setValue(form.bu);
            
            // Handle Attachments (Admin Only - columns 13 and 11)
            if (form.creationAttachment !== undefined) sheet.getRange(rowIndex, 13).setValue(form.creationAttachment);
            if (form.evidence !== undefined) sheet.getRange(rowIndex, 11).setValue(form.evidence);

            return { success: true };
        } else {
            return { success: false, error: "Order not found in Big C database" };
        }
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function resendBigCWorkOrderEmail(workOrderId) {
    try {
        var userEmail = Session.getActiveUser().getEmail();
        
        // Only admin can resend emails
        if (userEmail !== ADMIN_EMAIL) {
            return { success: false, error: "Access Denied: Only Admin can resend emails." };
        }
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        if (!sheet) return { success: false, error: "Sheet not found" };
        
        var data = sheet.getDataRange().getValues();
        var order = null;
        
        // Find the work order
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == workOrderId) {
                var row = data[i];
                order = {
                    id: row[1],
                    empId: row[2],
                    project: row[3],
                    details: row[4],
                    priority: row[5],
                    deadline: row[6],
                    startDate: row[13],
                    workDocNumber: row[14],
                    estimatedBudget: row[15],
                    budgetType: row[16],
                    contract: row[17],
                    vendor: row[18],
                    station: row[19],
                    prNumber: row[20],
                    poNumber: row[21],
                    creationAttachment: row[12]
                };
                break;
            }
        }
        
        if (!order) {
            return { success: false, error: "Work Order not found" };
        }
        
        // Build recipients list (same logic as processBigCWorkOrderForm)
        var toEmail = "";
        var ccEmails = [];
        
        // 1. Assignee Email (N) - TO
        var assigneeEmail = getEmployeeEmail(order.empId);
        toEmail = assigneeEmail;
        
        // 2. Managers (N+1, N+2) - CC
        var managerEmail = getManagerEmailForEmployee(order.empId);
        if (managerEmail) ccEmails.push(managerEmail);
        
        var managersManagerEmail = getManagersManagerEmail(order.empId);
        if (managersManagerEmail) ccEmails.push(managersManagerEmail);
        
        // 3. Vendor Email - CC
        if (order.vendor) {
            var vendors = getVendorList();
            var matchedVendor = vendors.find(function(v) { return v.name === order.vendor; });
            if (matchedVendor && matchedVendor.email) {
                ccEmails.push(matchedVendor.email);
            }
        }
        
        // 4. Add all ADM emails - CC
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
                        if (noteValue && String(noteValue).trim().toLowerCase() === "adm") {
                            var admEmail = empData[r][6];
                            if (admEmail && String(admEmail).indexOf("@") > -1) {
                                ccEmails.push(String(admEmail).trim());
                            }
                        }
                    }
                }
            }
        } catch (admErr) {
            Logger.log("Error fetching ADM emails: " + admErr.toString());
        }
        
        // Get employee name and department
        var empName = order.empId;
        var empDept = "";
        try {
            var empSheet = findEmployeeSheet();
            if (empSheet) {
                var empData = empSheet.getDataRange().getValues();
                for(var j=1; j<empData.length; j++) {
                    if(String(empData[j][1]) === String(order.empId)) {
                        empName = empData[j][2];
                        empDept = empData[j][13];
                        break;
                    }
                }
            }
        } catch(err) {
            Logger.log("Emp Lookup Error: " + err);
        }
        
        // Parse attachment URLs
        var attachmentUrls = [];
        if (order.creationAttachment) {
            attachmentUrls = String(order.creationAttachment).split("\n").filter(function(url) {
                return url && url.trim().startsWith("http");
            });
        }
        
        if (toEmail) {
            var subject = "[RESEND] Big C Work Order Review: " + order.project + " (Pending)";
            
            var htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
                    <p style="margin: 0; color: #92400e; font-weight: bold;">⚠️ RESENT BY ADMIN</p>
                </div>
                <h2 style="color: #1a73e8; margin-top: 0; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Big C Work Order Request</h2>
                
                <p style="color: #555;">A Big C Work Order has been submitted and is pending review.</p>

                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; width: 30%;">Project / Task</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">${order.project}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Work Order ID</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">${order.id}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Requestor</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <strong>${empName}</strong><br>
                            <span style="font-size: 12px; color: #777;">ID: ${order.empId} | Dept: ${empDept || '-'}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Work Doc Number</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">${order.workDocNumber || '-'}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                         <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">PO Number</td>
                         <td style="padding: 10px; border: 1px solid #e0e0e0;">${order.poNumber || '-'}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Station</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">${order.station || '-'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Priority</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <span style="padding: 4px 8px; border-radius: 4px; font-weight: bold; ${order.priority === 'High' ? 'background-color: #fee; color: #c00;' : order.priority === 'Medium' ? 'background-color: #ffeaa7; color: #d63031;' : 'background-color: #dfe6e9; color: #2d3436;'}">${order.priority}</span>
                        </td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Schedule</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <div>Start: ${order.startDate ? Utilities.formatDate(new Date(order.startDate), Session.getScriptTimeZone(), "dd MMM yyyy") : "-"}</div>
                            <div>Deadline: ${order.deadline ? Utilities.formatDate(new Date(order.deadline), Session.getScriptTimeZone(), "dd MMM yyyy") : "-"}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Budget</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <div>${order.estimatedBudget || '0'} THB</div>
                            <div style="font-size: 12px; color: #555;">Type: ${order.budgetType || '-'}</div>
                        </td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Contract & Vendor</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <div>Contract: ${order.contract || '-'}</div>
                            <div>Vendor: ${order.vendor || '-'}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; vertical-align: top;">Details</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            <div style="white-space: pre-wrap;">${order.details || '-'}</div>
                        </td>
                    </tr>
                    ${attachmentUrls.length > 0 ? `
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; vertical-align: top;">Attachments</td>
                        <td style="padding: 10px; border: 1px solid #e0e0e0;">
                            ${attachmentUrls.map(function(url) { return '<a href="' + url + '" target="_blank" style="color: #1a73e8; text-decoration: none;">📎 View Attachment</a>'; }).join('<br>')}
                        </td>
                    </tr>
                    ` : ''}
                </table>

                <div style="margin-top: 25px; text-align: center;">
                    <a href="${ScriptApp.getService().getUrl()}?page=bigc-work-order-report" 
                       style="background-color: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                       Open Dashboard to Review
                    </a>
                </div>
                
                <div style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
                    This email was resent by an administrator.
                </div>
            </div>
            `;
            
            var uniqueCC = [...new Set(ccEmails)];
            
            // Fetch attachments blobs
            var emailAttachments = [];
            if (attachmentUrls.length > 0) {
                attachmentUrls.forEach(function(url) {
                    try {
                        // Extract ID
                        var fileId = null;
                        if (url.indexOf("id=") > -1) {
                            fileId = url.split("id=")[1].split("&")[0];
                        }
                        
                        if (fileId) {
                            var file = DriveApp.getFileById(fileId);
                            emailAttachments.push(file.getBlob());
                        }
                    } catch (attErr) {
                         Logger.log("Error fetching attachment for email: " + attErr);
                    }
                });
            }

            var emailOptions = {
                to: toEmail,
                subject: subject,
                htmlBody: htmlBody
            };
            
            if (uniqueCC.length > 0) {
                emailOptions.cc = uniqueCC.join(",");
            }

            if (emailAttachments.length > 0) {
                emailOptions.attachments = emailAttachments;
            }

            MailApp.sendEmail(emailOptions);
            
            return { success: true, recipientCount: 1 + uniqueCC.length };
        } else {
            return { success: false, error: "No assignee email found" };
        }
        
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function getVendorList() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("Vender");
        if (!sheet) sheet = ss.getSheetByName("Vendor");
        
        if (!sheet) return []; // No vendor sheet found
        
        var data = sheet.getDataRange().getValues();
        if (data.length < 2) return []; // Empty or just header
        
        var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
        
        // Helper to find column index
        function getColIndex(possibleNames) {
            for (var i = 0; i < possibleNames.length; i++) {
                var idx = headers.indexOf(possibleNames[i].toLowerCase());
                if (idx !== -1) return idx;
            }
            return -1;
        }
        
        var nameIdx = getColIndex(["Vendor Name", "Vender Name", "Vendor", "Vender", "Name", "Company Name"]);
        var contactIdx = getColIndex(["Contact Name", "Contact Person", "Contact", "Name (Contact)"]);
        var phoneIdx = getColIndex(["Phone", "Tel", "Mobile", "Phone Number", "Telephone"]);
        var emailIdx = getColIndex(["Email", "E-mail", "Email Address"]);
        
        if (nameIdx === -1) return []; // Need at least a name
        
        var vendors = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var name = row[nameIdx];
            if (name) {
                vendors.push({
                    name: name,
                    contact: contactIdx !== -1 ? row[contactIdx] : "",
                    phone: phoneIdx !== -1 ? row[phoneIdx] : "",
                    email: emailIdx !== -1 ? row[emailIdx] : ""
                });
            }
        }
        
        return vendors;
        
    } catch (e) {
        console.error("Error getting vendor list: " + e.toString());
        return [];
    }
}
