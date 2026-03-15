function addWorkOrderAttachment(id, attachmentList) {
    try {
        var folderName = "Work_Orders_Attachments";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }

        var newUrls = [];

        attachmentList.forEach(function(att) {
            if(att.data && att.name) {
                var filename = id + "_" + new Date().getTime() + "_" + att.name; // Unique name
                var blob = Utilities.newBlob(Utilities.base64Decode(att.data), att.mimeType, filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        });

        if (newUrls.length === 0) return { success: false, error: "No valid files processing" };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Work_Orders");
        var data = sheet.getDataRange().getValues();
        var rowIndex = -1;
        var currentUrls = "";

        for (var i = 1; i < data.length; i++) {
            if (data[i][1] == id) {
                rowIndex = i + 1;
                currentUrls = data[i][12]; // Col 13 is Creation Attachment (Index 12)
                break;
            }
        }

        if (rowIndex > 0) {
            var updatedUrls = currentUrls ? currentUrls + "\n" + newUrls.join("\n") : newUrls.join("\n");
            sheet.getRange(rowIndex, 13).setValue(updatedUrls);
            return { success: true };
        } else {
            return { success: false, error: "Order not found" };
        }

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
