/// <reference path="../../../bower_components/polymer-ts/polymer-ts.ts"/>
/// <reference path="../../../typings/handlebars/handlebars.d.ts"/>
/// <reference path="../../../typings/github-electron/github-electron.d.ts" />
/// <reference path="../../../typings/path-extra/path-extra.d.ts" />
/// <reference path="../../../typings/bluebird/bluebird.d.ts" />

import handlebars = require("handlebars");
import fs = require("fs");
import localization = require("keysavcore/Localization");
import remote = require("remote");
import IpcClient = require("electron-ipc-tunnel/client");
import path = require("path-extra");
import Promise = require("bluebird");
import _ = require("lodash");

Promise.promisifyAll(fs);

handlebars.registerHelper(require("handlebars-helper-moment")());

(() => {
function mkdirOptional(path) {
    if (!fs.existsSync(path))
        fs.mkdirSync(path);
}

var dbDirectory = path.join(path.homedir(), "Documents", "KeySAVe", "db");
mkdirOptional(path.join(path.homedir(), "Documents", "KeySAVe"));
mkdirOptional(dbDirectory);

var clipboard = remote.require("clipboard");

@component("pkm-list")
class PkmList extends polymer.Base {
    @property({type: Array})
    pokemon: any[] = [];

    @property({type: String})
    formatString: string;

    @property({type: String})
    formatHeader: string;

    @property({type: String})
    formatName: string;

    @property({type: Number})
    lowerBox: number;

    @property({type: Number})
    upperBox: number;

    @property({type: String})
    fileName: string;

    @property({type: String})
    dialogResult: string;

    @property({type: String})
    language: string;

    private template: Handlebars.HandlebarsTemplateDelegate;
    private formatCache: {[pid: number]: string} = {};
    private ipcClient: IpcClient;
    private handlebarsHelpers: {[helper: string]: Function};
    private knownHelpers: string[];

    constructor() {
        super();

        this.ipcClient = new IpcClient();

        this.ipcClient.on("file-dialog-save-result", (filename) => {
            if (filename)
                fs.writeFile(filename, this.$.container.innerText, {encoding: "utf-8"}, (err) => {
                    if (err === null) {
                        this.dialogResult = "File saved successfully!";
                    }
                    else {
                        this.dialogResult = "Couldn't save file. Please try again.";
                    }
                    this.$.dialog.toggle();
                });
        });

        var self = this;
        this.handlebarsHelpers = {
            row: function() {
                return Math.floor(this.slot/6) + 1;
            },
            column: function() {
                return this.slot%6 + 1;
            },
            box: function() {
                return this.box+1;
            },
            speciesName: function() {
                return localization[self.language].species[this.species];
            },
            hasAlternateForm: function() {
                return !!localization[self.language].forms[this.species];
            },
            formName: function() {
                return localization[self.language].forms[this.species] ? localization[self.language].forms[this.species][this.form] : "";
            },
            natureName: function() {
                return localization[self.language].natures[this.nature];
            },
            abilityName: function() {
                return localization[self.language].abilities[this.ability];
            },
            typeName: function(typeId) {
                return localization[self.language].types[typeId];
            },
            moveName: function(moveId) {
                return moveId ? localization[self.language].moves[moveId] : "";
            },
            itemName: function(itemId) {
                return itemId ? localization[self.language].items[itemId] : "";
            },
            ballImage: function(ball) {
                return "[](/" + localization[self.language].items[this.ball].replace(" ", "").replace("é", "e").toLowerCase() + ")"
            },
            esv: function() {
                return ("0000"+this.esv).slice(-4);
            },
            tsv: function() {
                return ("0000"+this.tsv).slice(-4);
            },
            language: function() {
                return localization[self.language].languageTags[this.otLang];
            },
            genderString: function(gender) {
                switch (gender) {
                    case 0:
                        return "♂";
                    case 1:
                        return "♀";
                    case 2:
                        return "-";
                }
            },
            gameVersionString: function() {
                return localization[self.language].games[this.gameVersion];
            },
            stepsToHatch: function() {
                return this.isEgg * (this.otFriendship-1) * 256;
            },
            hasHa: function() {
                return this.abilityNum === 4;
            },
            checkmark: function(condition) {
                return condition ? "✓" : "✗";
            },
            pentagon: function() {
                return this.gameVersion >= 24 && this.gameVersion <= 27 ? "⬟" : "";
            },
            shinyMark: function() {
                return this.isShiny ? "★" : "";
            },
            markings: function() {
                return ((this.markings&0x01 ? "●" : "◯")
                      + (this.markings&0x02 ? "▲" : "△")
                      + (this.markings&0x04 ? "■" : "□")
                      + (this.markings&0x08 ? "♥" : "♡")
                      + (this.markings&0x10 ? "★" : "☆")
                      + (this.markings&0x20 ? "◆" : "◇"));
            },
            regionName: function() {
                return localization[self.language].regions[this.gameVersion];
            },
            countryName: function() {
                return localization[self.language].countries[this.countryID];
            },
            toJson: function(e) {
                return new handlebars.SafeString(JSON.stringify(e));
            }
        };

        this.knownHelpers = Object.keys(this.handlebarsHelpers);
        this.knownHelpers.push("moment");
    }

    formatPokemon(pkm) {
        var uuid = pkm.box*30+pkm.slot;
        var cached = this.formatCache[uuid];
        if (cached)
            return cached;
        else
            return this.formatCache[uuid] = this.template(pkm, {helpers: this.handlebarsHelpers});
    }

    isEmpty(pkm) {
        return pkm.length === 0;
    }

    filterPokemon(pkm) {
        return (this.lowerBox === undefined || pkm.box+1 >= this.lowerBox) && (this.upperBox === undefined || pkm.box < this.upperBox);
    }

    copyClipboard() {
        clipboard.write({text: this.$.container.innerText, html: this.$.container.innerHTML});
    }

    save() {
        var ext: string;
        var filters: any[];
        if (this.formatName.toLowerCase().indexOf("csv") !== -1) {
            ext = ".csv"
            filters = [{name: "CSV", extensions: ["csv"]}]
        }
        else if (this.formatName.toLowerCase().indexOf("json") !== -1) {
            ext = ".json"
            filters = [{name: "JSON", extensions: ["json"]}]
        }
        else {
            ext = ".txt"
            filters = [{name: "Text", extensions: ["txt"]}];
        }
        this.ipcClient.send("file-dialog-save", {options: {defaultPath: path.basename(this.fileName, path.extname(this.fileName))+ext, filters: filters}});
    }

    export() {
        var pkm = _.filter(this.pokemon, this.filterPokemon.bind(this))
        var ghosts = 0;
        fs.readdirAsync(dbDirectory)
        .then((files) => {
            return Promise.resolve(pkm).map((pkm: KeySAVCore.Structures.PKX) => {
                if (pkm.isGhost) {
                    ++ghosts;
                    return;
                }
                var fileName = ("000" + pkm.species).slice(-3) + " - " + pkm.nickname + " - " + pkm.pid.toString(16) + " - " + pkm.ec.toString(16);
                var counter = 0;
                if (_.includes(files, fileName + ".pk6")) {
                    ++counter;
                    while (_.includes(files, fileName + " (" + counter + ").pk6")) ++counter;
                }
                fileName += (counter ? " (" + counter + ")" : "")+".pk6";
                files.push(fileName);
                return fs.writeFileAsync(path.join(dbDirectory, fileName), new Buffer(pkm.data));
            });
        })
        .then(() => {
            this.dialogResult = "Saved " + (pkm.length-ghosts) + " Pokémon.";
            this.$.dialog.toggle();
        })
        .catch((e) => {
            console.log(e);
            this.dialogResult = "An error occured.";
            this.$.dialog.toggle();
        });
    }

    @observe("formatString")
    formatStringChanged(newValue, oldValue) {
        this.debounce("compileTemplate", () => {
            this.formatCache = {};
            try {
                this.template = handlebars.compile(newValue, {knownHelpers: this.knownHelpers});
            }
            catch (e) {}
        }, 500);
    }

    @observe("lowerBox, upperBox")
    filterRestrictionsChanged(lowerBox, upperBox) {
        this.$.list.render();
    }

    @observe("pokemon, language")
    pokemonChanged(pokemon, language) {
        this.formatCache = {};
    }
}
polymer.createElement(PkmList);
})()
