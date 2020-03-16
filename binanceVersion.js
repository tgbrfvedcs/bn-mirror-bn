const Mirror = require("./mirror");

const Binance = require("./binance");
const src = new Binance({
  key: "jyVWSOB7029qNy4TdOsHN0CJhBJ307prmUJrBrm1w4b7M8kBHLtEa6KkLrc4s2TN",
  sec: "n4eS5YWPUmP81enlK0nO5cR6nU5OD8tLi2quIPByyOjN3pIsC2Zd1xBRBiZCoNpc"
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
    const result = await Promise.all(list);
    return result;
  }
};

const checkAllWorkersInTolerance = async (srcPosition, allWorkersPosition) => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].isInTolerance(srcPosition, allWorkersPosition[i]));
    const result = await Promise.all(list);
    console.log("getAllWorkersPosition -> result", result);
  }
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

async function checker() {
  try {
    let srcTrades = await getSrcTrades();
    if (srcTrades[srcTrades.length - 1].orderId !== srcLastTradeId) {
      // 1. Get src status
      let srcPosition = await src._getStatus();
      console.log("srcPosition", srcPosition);
      // 2. Get ends status(Promise.all)
      let allWorkersPosition = await getAllWorkersPosition();
      // 3. Check if ends in src's tolarance (side & percent)
      let allWorkersInTolerance = await checkAllWorkersInTolerance(
        srcPosition,
        allWorkersPosition
      );
      //    -false--> All ends sync to src status
      // let syncWorkersToSrc = await syncAllWorkersToSrc(srcPosition,allWorkersInTolerance);
      srcLastTradeId = srcTrades.pop().orderId;
    }
  } catch (error) {
    console.log(error);
  }
  // const checker = async srcLastTradeId => {
}

(async () => {
  try {
    // 1. Get src status
    let srcPosition = await src._getStatus();
    console.log("srcPosition", srcPosition);

    // 2. Get ends status(Promise.all)
    let allWorkersPosition = await getAllWorkersPosition();
    // 3. Check if ends in src's tolarance (side & percent)
    let allWorkersInTolerance = await checkAllWorkersInTolerance(
      srcPosition,
      allWorkersPosition
    );
    //    -false--> All ends sync to src status
    // let syncWorkersToSrc = await syncAllWorkersToSrc(srcPosition,allWorkersInTolerance);

    // 4. Get src trades from src allorders
    let srcTrades = await getSrcTrades();
    // 5. Save last trades id in memory.
    srcLastTradeId = srcTrades.pop().orderId;

    // 6. Loop check if src has new order(last trade isn't the saved one)
    //    -true--> do step 1, 2(Promise.all), 3.false
    setInterval(checker, 5000);
    // debugger;
  } catch (error) {
    console.log(error);
  }
})();

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
