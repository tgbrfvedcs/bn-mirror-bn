const Mirror = require("./mirror");

const Binance = require("./binance");
const src = new Binance({
  key: "ir2CfEX20kNVJoMq5IAkA70kkUpIfOPE5F5ciHwmoRlPXwKfbCLthWWuFdw06HmP",
  sec: "7HD7ihkPhPGnb16XVt5Lh8jdYfLEo5gZpwD5QQSQfdRBepYi3eqlYX9bY4ZQzErL"
});
// 所有API都存在這裡
const cfg = require("./config.json");

const listWorkers = [];
const users = [];

let srcLastTradeId = 0;

for (let i = 0; i < cfg.workers.length; i++) {
  const workerInfo = cfg.workers[i];
  users.push({ name: workerInfo.name, leverage: workerInfo.leverage });
  listWorkers.push(new Mirror(workerInfo));
}
console.log(users);

const getAllWorkersPosition = async () => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].binance._getStatus());
  }
  const result = await Promise.all(list);
  return result;
};

const checkAllWorkersInTolerance = async (srcPosition, allWorkersPosition) => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].isInTolerance(srcPosition, allWorkersPosition[i]));
  }
  const result = await Promise.all(list);
  console.log("getAllWorkersPosition -> result", result);
  return list;
};

const syncAllWorkersToSrc = async (srcPosition, allWorkersInTolerance) => {
  const list = [];
  for (let i in allWorkersInTolerance) {
    if (allWorkersInTolerance[i] === false) {
      await listWorkers[i].mirrorToTarget(srcPosition);
    }
  }
};

const getSrcTrades = async () => {
  const fapiPrivate_get_allorders = await src.fapiPrivate_get_allorders({
    symbol: "BTCUSDT",
    limit: 20
  });
  // console.log("fapiPrivate_get_allorders", fapiPrivate_get_allorders);
  return fapiPrivate_get_allorders;
};

const genStatusResp = (allWorkersPosition, srcPosition) => {
  let msg = `Head position: ${srcPosition || "Unknown"}
--------------------------------------------
`;
  for (let i in listWorkers) {
    msg =
      msg +
      `Name: ${users[i].name}
Leverage: ${users[i].leverage},  Position: ${allWorkersPosition[i]}
`;
    return msg;
  }
};

const monitoring = async () => {
  let srcPosition = await src._getStatus();
  if(srcPosition === undefined || srcPosition === null){
    srcPosition = await src._getStatus()
  }
  console.log("srcPosition", srcPosition);
  // 2. Get ends status(Promise.all)
  let allWorkersPosition = await getAllWorkersPosition();
  // 3. Check if ends in src's tolarance (side & percent)
  let allWorkersInTolerance = [];
  if (srcPosition !== null) {
    allWorkersInTolerance = await checkAllWorkersInTolerance(
      srcPosition,
      allWorkersPosition
    );
  }

  const msg = genStatusResp(allWorkersPosition, srcPosition);
  if (
    srcPosition !== null &&
    allWorkersInTolerance.filter(e => e === false).length === 0
  ) {
    return msg;
  } else {
    return `===SOMETHING WRONG...===
${msg}
===SOMETHING WRONG...===`;
  }
};
monitoring()
module.exports = { monitoring };

// (async () => {
//   try {
//     // 1. Get src status
//     let srcPosition = await src._getStatus();
//     console.log("srcPosition", srcPosition);

//     // 2. Get ends status(Promise.all)
//     let allWorkersPosition = await getAllWorkersPosition();
//     // 3. Check if ends in src's tolarance (side & percent)
//     let allWorkersInTolerance = await checkAllWorkersInTolerance(
//       srcPosition,
//       allWorkersPosition
//     );
//     //    -false--> All ends sync to src status
//     // let syncWorkersToSrc = await syncAllWorkersToSrc(srcPosition,allWorkersInTolerance);

//     // 4. Get src trades from src allorders
//     let srcTrades = await getSrcTrades();
//     // 5. Save last trades id in memory.
//     srcLastTradeId = srcTrades.pop().orderId;
//     monitoring()
//     // 6. Loop check if src has new order(last trade isn't the saved one)
//     //    -true--> do step 1, 2(Promise.all), 3.false
//     setInterval(checker, 5000);
//     // debugger;
//   } catch (error) {
//     console.log(error);
//   }
// })();

// todo: 替換BitMEXClient成Binance，並使用binance._getStatus來取得當前配置
// 再來是透過下面API拿交易資料，加上mongodb來配置當前狀況
// fapiPrivate_get_allorders({ symbol: "BTCUSDT",limit :20 })

// client.addStream('', 'wallet', function(data, symbol, tableName) {
//   for (let worker of Object.keys(listWorkers)) {
//     listWorkers[worker].setWalletAmount(data[0].amount);
//   }
// });

// client.addStream('XBTUSD', 'position', function(data, symbol, tableName) {
//   for (let worker of Object.keys(listWorkers)) {
//     const { homeNotional, currentQty } = data[0];
//     listWorkers[worker].syncPositionandCheckUpdate(homeNotional, currentQty);
//   }
// });
