import {ProtractorBrowser} from "protractor";
import axios from 'axios';
import FormData from "form-data";
import Axios from "axios";

//todo add typings and move to helpers
function replaceInvalidSymbols(path: string) {
    //replace symbols that forbidden as Windows folder name
    return path.replace(/[\s\\/:*?"<>|.#]/g, '_');
}

async function getHeaders(form: FormData){
    return new Promise((resolve, reject) => {
        form.getLength((err, length) => {
            if(err) { reject(err); }
            let headers = Object.assign({'Content-Length': length}, form.getHeaders());
            resolve(headers);
        });
    });
}

function getNewId(): string {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + s4() + s4() + s4() + s4();
}

class ReportalClient{
    private projectId: string;
    private launchName: string;
    private takeScreenShots: boolean;
    private runningSuite: any = null;
    private allSuites: any[] = [];
    private allSpecs: any[] = [];
    private reportalUrl: string;
    private browser: ProtractorBrowser;
    //by default screenshots only on fail
    private takeScreenShotsAlways: boolean;

    constructor({projectId, launchName, reportalUrl, browser, takeScreenShotsAlways=false, takeScreenShots=true}: {projectId: string, launchName: string,
        reportalUrl: string, takeScreenShots?: boolean, browser: ProtractorBrowser, takeScreenShotsAlways?: boolean}){
        this.projectId = projectId;
        this.launchName = launchName;
        this.takeScreenShots = takeScreenShots;
        this.takeScreenShotsAlways = takeScreenShotsAlways;
        this.reportalUrl = reportalUrl;
        this.browser = browser;
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

    private takeScreenshots(spec: any) {
        if (spec.status === 'pending' || spec.status === 'disabled' || !this.takeScreenShots){
            return false;
        }
        return this.takeScreenShotsAlways || spec.status === 'failed';
    }

    private async reportScreenShot(screenId: string){
        const screenShot = await this.browser.takeScreenshot();
        const form = new FormData();
        form.append('screen', screenShot);
        form.append('projectId', this.projectId);
        form.append('launchName', this.launchName);
        form.append('screenId', screenId);
        const formHeaders = await getHeaders(form);
        try {
            await Axios.post(`http://localhost:3000/report-screen`, form, {headers: formHeaders});
        } catch (e) {
            console.error(e);
        }
    }

    jasmineStarted(){
        /* Dirty fix to make sure last screenshot is always linked to the report
        * TODO: remove once we're able to return a promise from specDone / suiteDone
        */
        afterAll(process.nextTick);
    }

    suiteStarted(suite: any) {
        try {
            suite = this.getSuiteClone(suite);
            suite.specs = [];
            suite.utcStarted = new Date();
            this.runningSuite = suite;
        } catch (e){
            console.error(e);
        }
    };

    specStarted(spec: any) {
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
        //immediately take screenshot to keep the state of the browser screen do it async
        if (this.takeScreenshots(spec)){
            spec.screenId = getNewId();
            this.reportScreenShot(spec.screenId)
        }
        spec = this.getSpecClone(spec);
        spec.utcFinished = new Date();
        spec.duration = (spec.utcFinished - spec.utcStarted)/1000;

        try {
            const capabilities =  await this.browser.getCapabilities();
            spec.browserVersion = capabilities.get('version');
            spec.platform = capabilities.get('platform');
            spec.browserName = capabilities.get('browserName');
            spec.specId = replaceInvalidSymbols(spec.description);
            spec.launchName = this.launchName;
            spec.projectId = this.projectId;
            await axios.post(`${this.reportalUrl}/report`, spec);
            console.log('Spec saved:');
            console.log(spec);
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
