import * as path from 'path';
import {browser} from "protractor";
import axios from 'axios';
//todo add typings

function replaceInvalidSymbols(path: string) {
    //replace symbols that forbidden as Windows folder name
    return path.replace(/[\s\\/:*?"<>|.#]/g, '_');
}

class ReportalClient{
    private projectId: string;
    private launchName: string;
    private disableScreenShots: boolean;
    private runningSuite: any = null;
    private allSuites: any[] = [];
    private allSpecs: any[] = [];
    private reportalUrl: string;

    constructor({projectId, launchName, reportalUrl, disableScreenShots=true}: {projectId: string, launchName: string, reportalUrl: string, disableScreenShots?: boolean}){
        this.projectId = projectId;
        this.launchName = launchName;
        this.disableScreenShots = disableScreenShots;
        this.reportalUrl = reportalUrl;
    }

    private getSuiteClone(suite: any) {
        for (let localSuite of this.allSuites){
            if (localSuite.id === suite.id){
                Object.assign(localSuite, suite);
                return localSuite;
            }
        }
        let currentSuiteClone = {...suite};
        this.allSuites.push(currentSuiteClone);
        return currentSuiteClone;
    }

    private getSpecClone(spec: any) {
        for (let localSpec of this.allSpecs){
            if (localSpec.id === spec.id){
                Object.assign(localSpec, spec);
                return localSpec;
            }
        }
        let currentSpecClone = {...spec};
        this.allSpecs.push(currentSpecClone);
        return currentSpecClone;
    }

    private skipScreenShooting(spec: any) {
        if (spec.status === 'pending' || spec.status === 'disabled'){
            return true;
        }

        return this.disableScreenShots;
    }

    async suiteStarted(suite: any) {
        try {
            suite = this.getSuiteClone(suite);
            suite.specs = [];
            suite.utcStarted = new Date();
            this.runningSuite = suite;
        } catch (e){
            console.error(e);
        }
    };

    async specStarted(spec: any) {
        try {
            spec = this.getSpecClone(spec);
            spec.utcStarted = new Date();
            spec.suite = this.runningSuite.description;
            this.runningSuite.specs.push(spec);
        } catch (e){
            console.error(e);
        }
    };

    async specDone(spec: any) {
        try {
            //immediately take screenshot to keep the state of the browser screen do it async
            if (!this.skipScreenShooting(spec)){
                const screenShot = await browser.takeScreenshot();
            }
            spec = this.getSpecClone(spec);
            spec.utcFinished = new Date();
            spec.duration = (spec.utcFinished - spec.utcStarted)/1000;

            const capabilities =  await browser.getCapabilities();
            spec.browserVersion = capabilities.get('version');
            spec.platform = capabilities.get('platform');
            spec.browserName = capabilities.get('browserName');
            spec.suiteDirectory = path.join(replaceInvalidSymbols(spec.suite), replaceInvalidSymbols(spec.browserName));
            spec.specId = replaceInvalidSymbols(spec.description);
            spec.launchName = this.launchName;
            spec.projectId = this.projectId;
            //todo axios send request
            await axios.post(`${this.reportalUrl}/report`, spec);

												
																  
			 
        } catch (e){
            console.error(e);
        }
    };

    async suiteDone(suite: any) {
        try {
            suite = this.getSuiteClone(suite);
            suite.utcFinished = new Date();
            suite.duration = (suite.utcFinished - suite.utcStarted)/1000;
            this.runningSuite = null;
        } catch (e){
            console.error(e);
        }
    };
}

export {
    ReportalClient
}
