// Delete Big C Work Order Function (Admin Only)
function deleteBigCWorkOrder(workOrderId, userEmail) {
    try {
        // Verify admin status
        var adminCheck = checkAdminStatus(userEmail);
        if (!adminCheck.isAdmin) {
            Logger.log('Delete attempt denied - not admin: ' + userEmail);
            return { success: false, error: 'Access denied: Admin privileges required' };
        }
        
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BigC_Work_Orders");
        if (!sheet) {
            return { success: false, error: 'Sheet not found' };
        }
        
        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;
        
        // Find row by work order ID (Column 2, index 1)
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][1]) === String(workOrderId)) {
                rowIndex = i + 1; // Sheet rows are 1-indexed
                break;
            }
        }
        
        if (rowIndex > 0) {
            // Delete the row
            sheet.deleteRow(rowIndex);
            Logger.log('Work order deleted: ' + workOrderId + ' by ' + userEmail);
            return { success: true, message: 'Work order deleted successfully', id: workOrderId };
        } else {
            return { success: false, error: 'Work order not found: ' + workOrderId };
        }
        
    } catch (e) {
        Logger.log('Error deleting work order: ' + e.toString());
        return { success: false, error: 'System error: ' + e.toString() };
    }
}
