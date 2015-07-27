/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/github-electron/github-electron.d.ts" />
/// <reference path="../typings/async/async.d.ts" />
/// <reference path="../typings/lodash/lodash.d.ts" />

import ipcServer = require("electron-ipc-tunnel/server");
import fs = require("fs");
import KeySAV = require("keysavcore");
import app = require("app");
import async = require("async");
import _ = require("lodash");
import util = require("util");

function bufToArr(buf: Buffer) {
    var tmp: Uint8Array = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
        tmp[i] = buf.readUInt8(i);
    }
    return tmp;
}

function padNumber(n) {
    return ("00000" + n).slice(-5);
}

export = function() {
    var store = new KeySAV.Extensions.KeyStore(process.cwd() + "/data");
    app.on("window-all-closed", () => store.close());
    ipcServer.on("dump-save", function(reply, args) {
        fs.readFile(args.path, function(err, buf) {
            var arr = bufToArr(buf);
            if (arr.length > 0x100000)
                arr = arr.subarray(arr.length % 0x100000);
            KeySAV.Core.SaveBreaker.Load(arr, store.getSaveKey.bind(store), function(e, reader: KeySAVCore.SaveReaderDecrypted) {
                if (e) {
                    // TODO notify client here
                    console.log("muh error " + e);
                    return;
                }
                var res = [];
                var tmp;
                for (let i = 0 + 30*(args.lower-1); i < args.upper*30; i++) {
                    tmp = reader.getPkx(i);
                    if (tmp !== null) {
                        res.push(tmp);
                    }
                }
                reply("dump-save-result", res);
            });
        });
    });

    var bvDumper: KeySAVCore.BattleVideoReader;

    ipcServer.on("dump-bv-open", function(reply, args) {
        fs.readFile(args, function(err, buf) {
            var arr = bufToArr(buf);
            KeySAV.Core.BattleVideoBreaker.Load(arr, store.getBvKey.bind(store), function(e, reader: KeySAVCore.BattleVideoReader) {
                bvDumper = reader;
                reply("dump-bv-opened", {enemyDumpable: reader.get_DumpsEnemy()});
            });
        });
    });

    ipcServer.on("dump-bv-dump", function(reply, args) {
        var res = [];
        var tmp;
        for (let i = 0; i < 6; ++i) {
            tmp = bvDumper.getPkx(i, args);
            if (tmp !== null) {
                res.push(tmp);
            }
        }
        reply("dump-bv-dumped", res);
    });

    var bvBreakRes: KeySAVCore.Structures.BattleVideoBreakResult;
    var savBreakRes: KeySAVCore.Structures.SaveBreakResult;
    var breakInProgress: number;

    ipcServer.on("break-key", function(reply, args) {
        async.parallel([fs.readFile.bind(fs, args.file1), fs.readFile.bind(fs, args.file2)], function(err, res: Buffer[]) {
            var files = _.map(res, bufToArr);
            if (files[0].length === 28256 && files[1].length === 28256) {
                breakInProgress = 1;
                bvBreakRes = KeySAV.Core.BattleVideoBreaker.Break(files[0], files[1]);
                reply("break-key-result", {success: bvBreakRes.success, path: "BV Key - " + (args.file1.match(/(\d+)[^\/\\]*$/)||{1: "00000000"})[1] + ".bin", result: bvBreakRes.result})
            } else {
                breakInProgress = 2;
                files = _.map(files, (f) => f.subarray(f.length % 0x100000));
                savBreakRes = KeySAV.Core.SaveBreaker.Break(files[0], files[1]);
                if (savBreakRes.success) {
                    var resPkx = new KeySAV.Core.Structures.PKX.ctor$1(savBreakRes.resPkx, 0, 0, false);
                    var path = util.format("SAV Key - %s - (%s.%s) - TSV %s.bin", resPkx.ot, padNumber(resPkx.tid), padNumber(resPkx.sid), ("0000"+resPkx.tsv).slice(-4));
                } else {
                    path = "";
                }
                reply("break-key-result", {success: savBreakRes.success, path: path, result: savBreakRes.result})
            }
        });
    });

    ipcServer.on("break-key-store", function(reply, args) {
        switch(breakInProgress) {
            case 1:
                store.setKey(args.path, bvBreakRes.key);
                breakInProgress = 0;
                bvBreakRes = undefined;
                break;
            case 2:
                store.setKey(args.path, savBreakRes.key.keyData, savBreakRes.key);
                breakInProgress = 0;
                savBreakRes = undefined;
                break;
        }
    });

    ipcServer.on("break-key-cancel", function() {
        breakInProgress = 0;
        bvBreakRes = savBreakRes = undefined;
    });
};
