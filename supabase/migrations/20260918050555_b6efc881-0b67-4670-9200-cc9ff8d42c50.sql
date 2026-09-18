CREATE TABLE public.classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Wet Waste','Dry Waste','Recyclable Waste','Hazardous Waste')),
  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  estimated_weight_kg numeric(8,3) NOT NULL DEFAULT 0,
  used_image boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.classifications TO service_role;
ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_sustainability_stats()
RETURNS TABLE (total_items bigint, recyclable_items bigint, diverted_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE category = 'Recyclable Waste')::bigint,
         COALESCE(sum(estimated_weight_kg) FILTER (WHERE category IN ('Recyclable Waste','Wet Waste')), 0)::numeric
  FROM public.classifications;
$$;
GRANT EXECUTE ON FUNCTION public.get_sustainability_stats() TO anon, authenticated, service_role;