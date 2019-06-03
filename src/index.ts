import {browser, ProtractorBrowser} from "protractor";
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
    private disableScreenShots: boolean;
    private runningSuite: any = null;
    private allSuites: any[] = [];
    private allSpecs: any[] = [];
    private reportalUrl: string;
    private browser: ProtractorBrowser;

    constructor({projectId, launchName, reportalUrl, browser, disableScreenShots=true}: {projectId: string, launchName: string,
        reportalUrl: string, disableScreenShots?: boolean, browser: ProtractorBrowser}){
        this.projectId = projectId;
        this.launchName = launchName;
        this.disableScreenShots = disableScreenShots;
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

    private skipScreenShooting(spec: any) {
        if (spec.status === 'pending' || spec.status === 'disabled'){
            return true;
        }

        return this.disableScreenShots;
    }

    private async reportScreenShot(screenId: string){
        const screenShot = await this.browser.takeScreenshot();
        const form = new FormData();
        form.append('screen', screenShot);
        const formHeaders = await getHeaders(form);
        try {
            await Axios.post(`http://localhost:3000/report-screen/${screenId}`, form, {headers: formHeaders});
        } catch (e) {
            console.error(e);
        }
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
        spec.screenId =getNewId();

        //immediately take screenshot to keep the state of the browser screen do it async
        if (!this.skipScreenShooting(spec)){
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
            axios.post(`${this.reportalUrl}/report`, spec).catch(error => console.error(error))
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
