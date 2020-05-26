const Binance = require('./binance');
// const { binance._offset, binance._postMirroOrder, binance._getStatus }
// const binance = new Binance();
// const cfg = require('./config');

module.exports = class Mirror {
  constructor(workerInfo) {
    this.satoshi = 0.00000001;
    this.walletAmount = 0;
    //positionPercent 必須相同
    this.srcPositionPercent = 0;
    this.name = workerInfo.name;
    this.leverage = workerInfo.leverage;
    this.srcDir = 0;
    this.positionQuantity = -Infinity;
    this.tolerance = this.leverage * 12;
    this.queryInt = 60000;
    this.endPositionPercent = 0;
    this.targetLastQueryTimestamp = 0;
    this.hasNewOrder = false;
    this.isSameDir = true;
    this.isFirstCall = true;
    this.isPlacingOrder = false;
    this.binance = new Binance(workerInfo);
  }

  async mirrorToTarget(srcPosition) {
    this.isPlacingOrder = true;
    this.hasNewOrder = true;
    console.log("putting Order");
    if (!srcPosition) {
      //平倉
      await this.binance._offset();
    } else {
      await this.binance._postMirroOrder(
        srcPosition* this.leverage
      );
    }
    // await this.syncEndPosition();
    // this.consoleStatus();
    this.isPlacingOrder = false;
  }

  async syncEndPosition() {
    const now = Date.now();
    const isGreaterQueryInt =
      now - this.targetLastQueryTimestamp > this.queryInt;
    if (isGreaterQueryInt || this.hasNewOrder) {
      this.endPositionPercent = await this.binance._getStatus();
      this.targetLastQueryTimestamp = now;
      this.hasNewOrder = false;
    }
  }

  consoleStatus() {
    console.log(
      `Update Time! ${new Date().toLocaleString()}
Direction: ${this.isSameDir ? "Same" : "Problem!!!!!!!!!!!!"}
Leverage : ${this.leverage}
Src position%: ${this.srcPositionPercent * 100}%
End position%: ${(this.endPositionPercent * 100).toFixed(2)}%`
    );
  }

  //only need to trade when not in tolerance
  isInTolerance(srcPositionPercent, endPositionPercent) {
    if (srcPositionPercent === undefined || endPositionPercent === undefined)
      return true;
    const diff =
      Math.abs(srcPositionPercent * this.leverage - endPositionPercent) * 100;
    this.isSameDir =
      Math.sign(srcPositionPercent) === Math.sign(endPositionPercent);
    if (diff > this.tolerance || !this.isSameDir) {
      return false;
    }
    return true;
  }

  async syncPositionandCheckUpdate(homeNotional) {
    this.srcPositionPercent =
      Math.round((homeNotional / this.walletAmount) * 100) / 100;
    this.srcDir = Math.sign(homeNotional);
    await this.syncEndPosition();

    if (!this.isInTolerance() && !this.isPlacingOrder) {
      this.consoleStatus();
      this.hasNewOrder = true;
      await this.mirrorToTarget();
    } else if (this.isFirstCall) {
      this.consoleStatus();
    }

    this.isFirstCall = false;
  }
};
