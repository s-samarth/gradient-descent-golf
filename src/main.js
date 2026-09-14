// Entry point: build the compat shell, mount the canvas, wire input + loop,
// restore a saved round, go. Any failure renders a diagnostic screen.

window.plethoraBit = {
  async init(ctx) {
    let canvas = null;
    let failed = false;
    try {
      const shell = createShell(ctx);
      const services = createServices(ctx);
      canvas = shell.createCanvas();
      const input = shell.trackPointer(canvas);
      const feedback = createFeedback(services);
      const game = createGame({ shell, services, canvas, input, feedback });

      game.render();
      services.markReady();

      shell.loop(dt => {
        if (failed) return;
        try {
          game.update(dt);
          game.render();
        } catch (err) {
          failed = true;
          showFailure(ctx, canvas, err, "Frame error");
        } finally {
          input.frameDone();
        }
      });

      // Resume after the first frame is on screen so a slow load never blocks play.
      game.restore();
    } catch (err) {
      failed = true;
      showFailure(ctx, canvas, err, "Init error");
      if (ctx && ctx.platform && typeof ctx.platform.ready === "function") ctx.platform.ready();
    }
  }
};
