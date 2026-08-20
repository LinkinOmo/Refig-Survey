function getAssignmentReport() {
    try {
        // Cache 60s — full Assignments + Employee_Database scan on every call.
        var _arCache = CacheService.getScriptCache();
        var _arHit = _arCache.get('ASSIGNMENT_REPORT_V1');
        if (_arHit) return JSON.parse(_arHit);

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assignments");
        if (!sheet) return { assignments: [] };

        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) return { assignments: [] };
        
        // Emp Map
        var empMap = {};
        try {
            var empSheet = findEmployeeSheet();
            if (empSheet) {
                var empData = empSheet.getDataRange().getValues();
                for(var j=1; j<empData.length; j++) {
                    if(empData[j][1]) empMap[String(empData[j][1])] = empData[j][2];
                }
            }
        } catch(e) {}

        // Assuming Column Order from processAssignmentForm in Code.gs:
        // 0: empId, 1: project, 2: role, 3: status, 4: start, 5: end, 6: achievements, 7: department
        // Note: Code.gs just does appendRow, so if headers exist, data starts at row 1 (0-indexed).
        // If no headers were created initially, it might be messy. 
        // Let's assume row 0 is headers if data.length > 0. 
        
        var results = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var empId = row[0];
            
            var assign = {
                empId: empId,
                empName: empMap[empId] || empId,
                project: row[1],
                role: row[2],
                status: row[3],
                start: row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                end: row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
                achievements: row[6],
                department: row[7]
            };
            results.push(assign);
        }
        
        var _arResult = { assignments: results.reverse() };
        try { _arCache.put('ASSIGNMENT_REPORT_V1', JSON.stringify(_arResult), 60); } catch (e) {}
        return _arResult;

    } catch (e) {
        return { error: e.toString() };
    }
}
