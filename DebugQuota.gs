function checkEmailQuota() {
  var remaining = MailApp.getRemainingDailyQuota();
  console.log("Remaining Daily Email Quota: " + remaining);
  return "Remaining Daily Email Quota: " + remaining;
}
