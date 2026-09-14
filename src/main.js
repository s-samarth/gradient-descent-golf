// Entry point: mount the canvas, wire input + loop, restore a saved round, go.

window.plethoraBit = {
  async init(ctx) {
    const canvas = ctx.createCanvas2D({ layer: "content", alpha: false, maxDpr: 2, coordinateSpace: "css" });
    const input = ctx.input.track(canvas);
    const feedback = createFeedback(ctx);
    const game = createGame(ctx, canvas, input, feedback);

    game.render();
    ctx.markVisualReady("course drawn");

    await game.restore();

    ctx.game.loop({
      input,
      update: dt => game.update(dt),
      render: () => game.render()
    });
    ctx.platform.ready();
  }
};
