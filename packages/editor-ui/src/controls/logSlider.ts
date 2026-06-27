export function mapLogSlider(t01: number, min: number, max: number): number {
	const t = Math.max(0, Math.min(1, t01));
	if (max <= min) return min;
	if (min <= 0) {
		return min + t * (max - min);
	}
	const logMin = Math.log(min);
	const logMax = Math.log(max);
	return Math.exp(logMin + t * (logMax - logMin));
}

export function unmapLogSlider(value: number, min: number, max: number): number {
	if (max <= min) return 0;
	if (min <= 0) {
		return Math.max(0, Math.min(1, (value - min) / (max - min)));
	}
	const logMin = Math.log(min);
	const logMax = Math.log(max);
	const logValue = Math.log(Math.max(value, min));
	return Math.max(0, Math.min(1, (logValue - logMin) / (logMax - logMin)));
}
