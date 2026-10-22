export function isWorkerOnline(worker,now=Date.now()){return !!(worker?.running&&now-worker.at<45000);}
