DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.user_roles;

CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));