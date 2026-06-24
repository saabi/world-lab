import { cross3, dot3, len3, scale3, type Vec3 } from '../math/vec.js';
import type { OrbitPrediction } from './types.js';

export interface OrbitMonitorDrawParams {
	relPosition: Vec3;
	velocity: Vec3;
	bodyRadius: number;
	prediction: OrbitPrediction;
	size?: number;
}

export function drawOrbitMonitor(
	ctx: CanvasRenderingContext2D,
	params: OrbitMonitorDrawParams
): void {
	const size = params.size ?? 180;
	const { relPosition: pos, velocity: vel, bodyRadius, prediction } = params;
	const { pathPoints, crashed, pePoint, apPoint } = prediction;

	ctx.clearRect(0, 0, size, size);

	ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, size / 4, 0, 2 * Math.PI);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(0, size / 2);
	ctx.lineTo(size, size / 2);
	ctx.moveTo(size / 2, 0);
	ctx.lineTo(size / 2, size);
	ctx.stroke();

	const rLen = len3(pos);
	if (rLen < 1e-3 || pathPoints.length === 0) return;

	let normal = cross3(pos, vel);
	let nLen = len3(normal);
	if (nLen < 1e-4) {
		const altAxis: Vec3 = Math.abs(pos[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
		normal = cross3(pos, altAxis);
		nLen = len3(normal);
	}
	const normalDir = scale3(normal, 1 / (nLen || 1));
	const basisX = scale3(pos, 1 / rLen);
	const basisY = cross3(normalDir, basisX);

	let maxD = bodyRadius * 1.5;
	for (const pt of pathPoints) {
		const d = len3(pt);
		if (d > maxD) maxD = d;
	}

	const padding = 15;
	const drawRadius = size / 2 - padding;
	const sc = drawRadius / maxD;
	const cx = size / 2;
	const cy = size / 2;

	const planetRad = bodyRadius * sc;
	ctx.beginPath();
	ctx.arc(cx, cy, planetRad, 0, 2 * Math.PI);
	ctx.fillStyle = 'rgba(10, 30, 60, 0.6)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
	ctx.lineWidth = 1.5;
	ctx.stroke();

	ctx.strokeStyle = '#00f0ff';
	ctx.lineWidth = 2;
	ctx.shadowBlur = 4;
	ctx.shadowColor = '#00f0ff';
	ctx.beginPath();
	for (let i = 0; i < pathPoints.length; i++) {
		const pt = pathPoints[i];
		const px = dot3(pt, basisX) * sc;
		const py = dot3(pt, basisY) * sc;
		const sx = cx + px;
		const sy = cy - py;
		if (i === 0) ctx.moveTo(sx, sy);
		else ctx.lineTo(sx, sy);
	}
	ctx.stroke();
	ctx.shadowBlur = 0;

	const scX = cx + rLen * sc;
	ctx.fillStyle = '#ffffff';
	ctx.shadowBlur = 6;
	ctx.shadowColor = '#ffffff';
	ctx.beginPath();
	ctx.arc(scX, cy, 4, 0, 2 * Math.PI);
	ctx.fill();
	ctx.shadowBlur = 0;

	if (pePoint) {
		const px = dot3(pePoint, basisX) * sc;
		const py = dot3(pePoint, basisY) * sc;
		ctx.beginPath();
		ctx.arc(cx + px, cy - py, 3.5, 0, 2 * Math.PI);
		ctx.fillStyle = '#00ff66';
		ctx.fill();
	}
	if (apPoint) {
		const px = dot3(apPoint, basisX) * sc;
		const py = dot3(apPoint, basisY) * sc;
		ctx.beginPath();
		ctx.arc(cx + px, cy - py, 3.5, 0, 2 * Math.PI);
		ctx.fillStyle = '#ff3366';
		ctx.fill();
	}
	if (crashed && pathPoints.length > 0) {
		const crashPt = pathPoints[pathPoints.length - 1];
		const px = dot3(crashPt, basisX) * sc;
		const py = dot3(crashPt, basisY) * sc;
		ctx.strokeStyle = '#ff3333';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(cx + px - 4, cy - py - 4);
		ctx.lineTo(cx + px + 4, cy - py + 4);
		ctx.moveTo(cx + px + 4, cy - py - 4);
		ctx.lineTo(cx + px - 4, cy - py + 4);
		ctx.stroke();
	}
}
