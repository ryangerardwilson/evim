# evim Example

This file is a compact Markdown document you can open with:

```bash
evim EXAMPLE.md
```

## Inline Math

Inline LaTeX works inside prose. The expression $f'(x)$ is read as "f prime of
x" and means the derivative of $f(x)$. The prime mark is not a colon.

## Block Math

$$
f(x) = x^2
$$

$$
f'(x) = 2x
$$

## Equation Plot

```evim-plot
plot.func({
  x: [-4, 4],
  samples: 300,
  title: "quadratic and derivative",
  series: [
    { labelLatex: "y=x^2", y: x => x * x, color: "cyan" },
    { labelLatex: "y=2x", y: x => 2 * x, color: "yellow" }
  ]
})
```

## Image

Markdown images are resolved relative to the opened `.md` file:

```md
![caption](./diagram.png)
```
