import { HSK1_CATEGORIES } from '@/data/hskCategories';

export function HskCategoryList() {
  return (
    <section
      id="hsk1-categories"
      className="mx-auto mt-12 w-full max-w-5xl rounded-3xl border border-white/40 bg-white/70 p-6 shadow-xl shadow-indigo-100/40 backdrop-blur-xl sm:p-10"
      aria-labelledby="hsk1-categories-title"
    >
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-600">
          Kategorie HSK1
        </p>
        <h2 id="hsk1-categories-title" className="mt-2 text-2xl font-bold text-neutral-800 sm:text-3xl">
          Gotowe zestawy słówek z wymową i tłumaczeniami
        </h2>
        <p className="mt-3 text-sm text-neutral-600 sm:text-base">
          Wybierz kategorię, aby skupić się na konkretnym obszarze słownictwa. Każde słowo zawiera zapis
          hanzi, wymowę pinyin oraz polskie i angielskie znaczenie.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {HSK1_CATEGORIES.map((category) => (
          <article
            key={category.id}
            className="flex h-full flex-col rounded-2xl border border-white/60 bg-white/80 p-5 shadow-inner shadow-white/50"
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-sky-700">{category.name}</h3>
              <p className="mt-1 text-sm text-neutral-600">{category.description}</p>
            </div>

            <table className="w-full border-separate text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-neutral-500">
                  <th className="pb-2 pr-3">Hanzi</th>
                  <th className="pb-2 pr-3">Pinyin</th>
                  <th className="pb-2 pr-3">Polski</th>
                  <th className="pb-2">Angielski</th>
                </tr>
              </thead>
              <tbody>
                {category.entries.map((entry) => (
                  <tr key={entry.hanzi} className="align-top text-neutral-700">
                    <td className="pb-2 pr-3 font-medium text-neutral-900">{entry.hanzi}</td>
                    <td className="pb-2 pr-3 text-sky-600">{entry.pinyin}</td>
                    <td className="pb-2 pr-3">{entry.meaningPl}</td>
                    <td className="pb-2">{entry.meaningEn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </section>
  );
}
