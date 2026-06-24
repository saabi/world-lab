import type { Vec3 } from '../math/vec.js';
import type { OrbitPrediction } from './types.js';

export interface OrbitPredictorRequest {
	relPosition: Vec3;
	velocity: Vec3;
	gravityG: number;
	radiusMeters: number;
	predictionHorizonSeconds: number;
	predictionAutoPeriod: boolean;
	requestId: number;
}

type PendingRequest = Omit<OrbitPredictorRequest, 'requestId'>;

export class OrbitPredictorClient {
	private worker: Worker | null = null;
	private pending = false;
	private queued: PendingRequest | null = null;
	private _result: OrbitPrediction = {
		pathPoints: [],
		crashed: false,
		pePoint: null,
		apPoint: null
	};
	private onUpdate: ((r: OrbitPrediction) => void) | null = null;

	constructor(onUpdate?: (r: OrbitPrediction) => void) {
		this.onUpdate = onUpdate ?? null;
	}

	get result(): OrbitPrediction {
		return this._result;
	}

	start(): void {
		if (this.worker) return;
		this.worker = new Worker(new URL('../workers/orbitPredictor.ts', import.meta.url), {
			type: 'module'
		});
		this.worker.onmessage = (e: MessageEvent) => {
			this.pending = false;
			const data = e.data as {
				pathPoints: Vec3[];
				crashed: boolean;
				pePoint: Vec3 | null;
				apPoint: Vec3 | null;
			};
			this._result = {
				pathPoints: data.pathPoints,
				crashed: data.crashed,
				pePoint: data.pePoint,
				apPoint: data.apPoint
			};
			this.onUpdate?.(this._result);
			if (this.queued) {
				const q = this.queued;
				this.queued = null;
				this.send(q);
			}
		};
	}

	stop(): void {
		this.worker?.terminate();
		this.worker = null;
		this.pending = false;
		this.queued = null;
	}

	request(req: PendingRequest): void {
		if (!this.worker) this.start();
		if (this.pending) {
			this.queued = req;
			return;
		}
		this.send(req);
	}

	private send(req: PendingRequest): void {
		if (!this.worker) return;
		this.pending = true;
		this.worker.postMessage({
			freeFlyPosition: [...req.relPosition],
			spaceflightVelocity: [...req.velocity],
			spaceflightGravity: req.gravityG,
			seaLevelRadius: req.radiusMeters,
			radius: req.radiusMeters,
			predictionHorizonSeconds: req.predictionHorizonSeconds,
			predictionAutoPeriod: req.predictionAutoPeriod,
			requestId: Date.now()
		});
	}
}
