//! Criterion benchmark of one `SplitOperator2D::step` at the M1 reference
//! grid sizes 128^2, 256^2 and 512^2 on `[-16, 16)^2`: a gaussian packet in
//! the harmonic potential, unit parameters, `dt = 0.01`. This is the
//! per-step cost the web app's speed budget (and the M1 perf gate) is
//! stated against. Local-only (`cargo bench -p psiforge-core`); CI runs the
//! test suites, not the benchmarks.

use criterion::{Criterion, criterion_group, criterion_main};
use psiforge_core::grid::Grid2D;
use psiforge_core::potential::harmonic2d;
use psiforge_core::propagator::{Propagator, SplitOperator2D};
use psiforge_core::states::gaussian_2d;

fn bench_step2d(c: &mut Criterion) {
    let mut group = c.benchmark_group("step2d");
    for n in [128usize, 256, 512] {
        let grid = Grid2D::new(n, n, -16.0, 16.0, -16.0, 16.0).expect("bench grid is valid");
        let mut wf = gaussian_2d(&grid, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0)
            .expect("bench packet is valid");
        let v = harmonic2d(&grid, 1.0, 1.0);
        let mut prop =
            SplitOperator2D::new(&grid, 0.01, 1.0, 1.0).expect("bench propagator is valid");
        group.bench_function(format!("{n}x{n}").as_str(), |b| {
            b.iter(|| prop.step(&mut wf, &v).expect("bench step must succeed"));
        });
    }
    group.finish();
}

criterion_group!(benches, bench_step2d);
criterion_main!(benches);
