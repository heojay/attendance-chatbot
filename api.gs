const ATTEND = "login"
const LEAVE = "logout"

function msToHHHMMSS(ms) {
  ms += 999 // 소수점 보정
  // 1- Convert to seconds:
  var seconds = ms / 1000;
  // 2- Extract hours:
  var hours = parseInt( seconds / 3600 ); // 3,600 seconds in 1 hour
  seconds = seconds % 3600; // seconds remaining after extracting hours
  // 3- Extract minutes:
  var minutes = parseInt( seconds / 60 ); // 60 seconds in 1 minute
  // 4- Keep only seconds not extracted to minutes:
  seconds = parseInt(seconds % 60);
  
  var fhours = ("00" + hours).slice(-3) // 그래도 100시간 넘는 사람도 생길테니까.. H만 HHH로
  var fmins = ("0" + minutes).slice(-2)
  var fsecs = ("0" + seconds).slice(-2)
  
  return fhours+":"+fmins+":"+fsecs;
}

function convertTZ(date) {
  return date.toLocaleString("ko-KR", {timeZone: "Asia/Seoul"});   
}

function doGet(e){  
  switch(e.parameter["command"]) {
    case "login":
      return logIn(e);
      break;
    case "logout":
      return logOut(e);
      break;
    case "viewAtt":
      return getAttendanceStatus(e);
      break;
    default:
      return ContentService.createTextOutput(JSON.stringify({"req_t" : "GET", "header" : e})).setMimeType(ContentService.MimeType.JSON);
      break;
  }
}

function logIn(raw) {
  var lock = LockService.getPublicLock();
  lock.waitLock(10000); 

  try{
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DB");
    var data = sheet.getRange(2, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var row;
    var now = new Date(), minNow = new Date();
    minNow.setHours(minNow.getHours() - 6);
    
    // it must be guaranteed that headers do not get modified
    for(row = data.length-1; row >= 0; row--) { // search backward from last row
      // same userid with login or logout command
      if( data[row][1] == raw.parameter["userID"] &&
         (data[row][2] == "login" || data[row][2] == "logout") ) { 
        var loggedTime = new Date(data[row][0]);
        if( minNow <= loggedTime && loggedTime <= now ) { // logged within 6 hours => throw error
          return ContentService.createTextOutput("오늘은 이미 출첵을 하셨어요! 내일 다시 출석해주세요");
        } else {
          break;  // 첫 내역이 6시간 이전이면 새로 출첵.
        }
      }
    }

    var newRow = [now, raw.parameter["userID"], raw.parameter["command"]];
    
    sheet.getRange(sheet.getLastRow()+1, 1, 1, sheet.getLastColumn()).setValues([newRow]);
        
    var output = "안녕하세요! "+raw.parameter["userID"]+"님 "+convertTZ(now)+"에 출첵 완료! 오늘도 뜻깊은 시간 보내봅시다!";
    return ContentService.createTextOutput(output);
  } catch(err) {
    return ContentService.createTextOutput("문제가 생겼어요. 다시 시도해주세요");
  } finally {
    lock.releaseLock();
  }
}

function logOut(raw) {
  var lock = LockService.getPublicLock();
  lock.waitLock(10000);
  
  try{
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DB");
    var data = sheet.getRange(2, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var row;
    var now = new Date(), minNow = new Date();
    minNow.setHours(minNow.getHours() - 6);
    
    // it must be guaranteed that headers do not get modified
    for(row = data.length-1; row >= 0; row--) { // search backward from last row
      // same userid with login or logout command
      if( data[row][1] == raw.parameter["userID"] &&
         (data[row][2] == "login" || data[row][2] == "logout")
        ) { 
        var loggedTime = new Date(data[row][0]); 
        
        if( minNow <= loggedTime && loggedTime <= now ) { // logged within 6 hours
          if( data[row][2] == "login" ) { // logout within 6 hours of previous login => normal
            break;
          } else { // logout within 6 hours of previous logout => double logout
            return ContentService.createTextOutput("오늘은 이미 퇴첵을 하셨어요! 내일 다시 만나요!");
          }
        } else {
          break;  // 첫 내역이 6시간 이전이면 새로 출첵.
        }
      }
    }
    
    var newRow = [now, raw.parameter["userID"], raw.parameter["command"]];
    
    sheet.getRange(sheet.getLastRow()+1, 1, 1, sheet.getLastColumn()).setValues([newRow]);
        
    var output = raw.parameter["userID"]+"님 "+convertTZ(now)+"에 퇴첵 완료! 오늘 하루 고생 많으셨습니다!"
    return ContentService.createTextOutput(output);
  } catch(err) {
    return ContentService.createTextOutput("문제가 생겼어요. 다시 시도해주세요");
  } finally {
    lock.releaseLock();
  }
}

function getAttendanceStatus(e) {
  try{
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    
    var sheet = doc.getSheetByName("DB");
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var nextRow = sheet.getLastRow() + 1;
    
    var userID = e.parameter["userID"]
   
    var curCommand = LEAVE
    var curTime = ""
    var count = 0
    var accTime = 0
        
    // TODO LastRow는 무조건 마지막 줄임.. 조심
    for (var i = 2; i <= sheet.getLastRow(); i++) {
      var row = sheet.getRange(i, 1, 1, 3).getValues()[0] // 순서대로 Time, UserID, Command라 가정
      var rowTime = row[0]
      var rowUserID = row[1]
      var rowCommand = row[2]
      if (rowUserID == userID) { // ID가 같은 경우만 봄
        if (rowCommand != curCommand) { // 상태가 변함. 입실 -> 퇴실이든 퇴실 -> 입실이든
          curCommand = rowCommand
          if (curCommand == LEAVE) { // 입실 -> 퇴실임
            accTime += parseInt(rowTime.getTime() - curTime.getTime())
            count += 1
          } else { // 출석임
            curTime = rowTime // 시간을 기록함
          }
        } else if (rowCommand == ATTEND) { // 출석인데 또 출석임
          curTime = rowTime // 시간을 갱신함
        } // 퇴석인데 또 퇴석인 경우는 그냥 지나감. (뭔가 잘못됐으니 출석을 만날때까지 진행)
      }
    }
    
    // TODO? 아직 퇴석을 안했으면 기록 안됨.
    
    var formattedTime = msToHHHMMSS(accTime)
    
    // formating HH:MM:SS로 바꾸기
    var output = userID+"님 "+"지금까지 "+count+"번 출석하셨고, "+formattedTime+"을 Work'tudy With Me와 함께 하셨습니다!" 
    
    Logger.log(output)
    
    return ContentService.createTextOutput(output)
  } catch(err) {
    return ContentService.createTextOutput("문제가 생겼어요. 다시 시도해주세요")
  } 
}
