function logUserActivity(email, action, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Activity_Log");
    
    // Create or Get Sheet
    if (!sheet) {
      sheet = ss.insertSheet("Activity_Log");
      sheet.appendRow(["Timestamp", "Email", "Name", "Role", "Action", "Details"]); // New Structure
      sheet.setFrozenRows(1);
    }
    
    // Check if we need to migrate headers (simple check: col C should be 'Name')
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var hasNameCol = headers.length >= 3 && headers[2] === "Name";
    
    // Find User Details in DB
    var name = "";
    var role = "";
    
    try {
        // Minimal lookup to avoid performance hit on every log? 
        // Or full lookup? Let's do a quick lookup helper or use existing.
        // We can reuse logic from checkAdminStatus or similar, but lighter?
        // Let's just scan.
        var empSheet = findEmployeeSheet();
        if (empSheet) {
             var data = empSheet.getDataRange().getValues();
             var h = data[0];
             var eIdx = -1, nIdx = -1, rIdx = -1;
             
             // Find cols
             for (var i=0; i<h.length; i++) {
                 var lc = String(h[i]).toLowerCase();
                 if (lc === 'email') eIdx = i;
                 else if (['full name', 'name', 'employee name'].includes(lc)) nIdx = i;
                 else if (['role', 'user type', 'usertype', 'position'].includes(lc) && rIdx === -1) rIdx = i; // Prefer Role, then Position
             }
             
             if (eIdx > -1) {
                 var searchEmail = String(email).trim().toLowerCase();
                 for (var i=1; i<data.length; i++) {
                     if (String(data[i][eIdx]).trim().toLowerCase() === searchEmail) {
                         name = nIdx > -1 ? data[i][nIdx] : "";
                         role = rIdx > -1 ? data[i][rIdx] : "";
                         break;
                     }
                 }
             }
        }
    } catch(e) {
        console.warn("Log Lookup Failed", e);
    }

    // Append Row
    if (hasNameCol) {
         sheet.appendRow([new Date(), email, name, role, action, details || ""]);
    } else {
         // Legacy mode or append to details
         var enhancedDetails = (details || "") + " [Name: " + name + ", Role: " + role + "]";
         sheet.appendRow([new Date(), email, action, enhancedDetails]);
    }
    
  } catch (e) {
    console.error("logUserActivity Error", e);
  }
}

function getAdminDashboardData(clientEmail) {
  try {
    // Trust the email passed from frontend (authenticated via loginUser)
    // If not passed, fallback to Session (which might fail if they are different)
    var userEmail = clientEmail || Session.getActiveUser().getEmail();
    var adminStatus = checkAdminStatus(userEmail);
    
    if (!adminStatus.isAdmin) {
      var logs = adminStatus.logs ? adminStatus.logs.join("\n") : "No logs available.";
      throw new Error("Permission Denied.\n\nDebug Info:\n" + logs);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("Activity_Log");
    var empSheet = findEmployeeSheet(); // From Code.gs
    
    if (!logSheet) return { onlineUsers: [], loginStats: [], orgStats: [] };
    
    // Get Logs (Last 7 days approx for stats, or just all for now? limit to last 2000 rows?)
    var lastRow = logSheet.getLastRow();
    var startRow = Math.max(2, lastRow - 2000); // Analyze last 2000 actions
    if (lastRow < 2) return { onlineUsers: [], loginStats: [], orgStats: [] };

    var logs = logSheet.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
    // Logs: [Timestamp, Email, Action, Details] (Col 0, 1, 2, 3)

    // Get Employees for Dept/Role mapping
    var empData = empSheet.getDataRange().getValues();
    var empMap = {}; // Email -> {Name, Dept, Role}
    
    // Header search
    var headers = empData[0];
    var eEmailIdx = 6, eNameIdx = 2, eDeptIdx = 13, eRoleIdx = -1; // defaults
    for(var i=0; i<headers.length; i++) {
        var h = String(headers[i]).toLowerCase();
        if(h === 'email') eEmailIdx = i;
        else if(h === 'full name') eNameIdx = i;
        else if(h === 'department') eDeptIdx = i;
        else if(['user type', 'role', 'usertype', 'access level', 'admin', 'permission'].includes(h)) eRoleIdx = i;
    }
    
    for(var i=1; i<empData.length; i++) {
        var email = String(empData[i][eEmailIdx]).toLowerCase().trim();
        if(email) {
            empMap[email] = {
                name: empData[i][eNameIdx],
                dept: empData[i][eDeptIdx] || "Unassigned",
                role: eRoleIdx > -1 ? String(empData[i][eRoleIdx]).trim() : "User"
            };
        }
    }

    // Process Data
    var now = new Date();
    var fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
    
    var onlineMap = {};
    var loginCounts = {};
    var deptCounts = {};
    var adminActivityCount = 0;
    var adminUsersMap = {};
    
    logs.forEach(function(row) {
        var ts = new Date(row[0]);
        var email = String(row[1]).toLowerCase().trim();
        var action = row[2];
        
        if (!email) return;

        // Check if Admin
        var isUserAdmin = false;
        if (empMap[email] && String(empMap[email].role).toLowerCase() === 'admin') {
            isUserAdmin = true;
            adminActivityCount++;
            adminUsersMap[email] = (adminUsersMap[email] || 0) + 1;
        }

        // Online Status (Action = 'Visit' or 'Login' or 'Dashboard View')
        if (ts > fifteenMinsAgo) {
            onlineMap[email] = ts;
        }
        
        // Stats
        if (action === 'Visit' || action === 'Login' || action === 'Dashboard View') {
            loginCounts[email] = (loginCounts[email] || 0) + 1;
            
            var dept = empMap[email] ? empMap[email].dept : "External/Unknown";
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        }
    });
    
    // Format Results
    var onlineUsers = [];
    for (var email in onlineMap) {
        onlineUsers.push({
            email: email,
            name: empMap[email] ? empMap[email].name : email,
            lastActive: Utilities.formatDate(onlineMap[email], Session.getScriptTimeZone(), "HH:mm:ss")
        });
    }
    
    var loginStats = [];
    for (var email in loginCounts) {
        loginStats.push({
            name: empMap[email] ? empMap[email].name : email,
            count: loginCounts[email],
            dept: empMap[email] ? empMap[email].dept : "Unknown"
        });
    }
    loginStats.sort(function(a, b) { return b.count - a.count; });
    
    var orgStats = [];
    for (var dept in deptCounts) {
        orgStats.push({
            dept: dept,
            count: deptCounts[dept]
        });
    }
    orgStats.sort(function(a, b) { return b.count - a.count; });

    // Admin Specific Stats
    var adminStats = [];
    for (var email in adminUsersMap) {
        adminStats.push({
            name: empMap[email] ? empMap[email].name : email,
            count: adminUsersMap[email]
        });
    }
    adminStats.sort(function(a, b) { return b.count - a.count; });

    return {
        onlineUsers: onlineUsers,
        loginStats: loginStats.slice(0, 50),
        orgStats: orgStats,
        adminMetrics: {
            totalActions: adminActivityCount,
            uniqueAdmins: Object.keys(adminUsersMap).length,
            topAdmins: adminStats
        }
    };

  } catch (e) {
    console.error("getAdminDashboardData Error", e);
    return { error: e.toString() };
  }
}
