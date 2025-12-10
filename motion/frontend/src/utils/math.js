
export function calculateStopSignYaw(dirX, dirY) {
    return Math.atan2(dirY, dirX) + Math.PI;
}
